import { proxy, useSnapshot } from "valtio"

type MessageStore = {
	channels: Record<string, MessageChannel>
	postMessage: (message: Omit<Message, "id">) => PostMessageReturn
	removeMessage: (message: Pick<Message, "id" | "channel">) => void
}
type MessageChannel = {
	id: string
	messages: Message[]
	removeMessage: (message: Message) => void
}
type Message = {
	id: number
	channel: string
	/** unique message type. only one message per type channel */
	uType?: string
	message: string
	duration?: number
	source?: unknown
}
type PostMessageReturn = {
	update: (text: string, newDuration?: number) => void
	remove: () => void
}

let messageIdCounter = 0

const store: MessageStore = proxy({
	channels: {},
	postMessage: (message: Omit<Message, "id">) => {
		const channel = message.channel
		if (!store?.channels?.[channel]) {
			console.warn("No such channel", message.channel)
			return { remove: () => {}, update: () => {} }
		}
		const id = messageIdCounter++
		if (message.uType) {
			const uTypeMsgs = store.channels[channel].messages.filter((m) => m.uType === message.uType)
			uTypeMsgs.forEach((umsg) => {
				store.removeMessage(umsg)
			})
		}
		store.channels[channel].messages.push({ ...message, id })

		let timeout: ReturnType<typeof setTimeout> | null = null

		const remove = () => {
			if (timeout) clearTimeout(timeout)
			store.removeMessage({ channel, id })
		}
		const update = (text: string, newDuration?: number) => {
			const updMessage = store.channels[channel].messages.find((m) => m.id === id)
			if (!updMessage) return
			updMessage.message = text
			if (newDuration && newDuration > 0) {
				updMessage.duration = newDuration
				if (timeout != null) clearTimeout(timeout)
				timeout = removeAfter(channel, id, newDuration)
			}
		}

		if (message.duration && message.duration > 0) {
			timeout = removeAfter(channel, id, message.duration)
		}

		return { remove, update }
	},
	removeMessage: (message: Pick<Message, "id" | "channel">) => {
		const channel = store?.channels[message.channel]
		if (!channel) return
		const index = channel?.messages.findIndex((m) => m.id === message.id)
		if (index === -1) return
		channel.messages.splice(index, 1)
	},
})

function removeAfter(channel: string, id: number, duration: number) {
	return setTimeout(() => {
		store.removeMessage({ channel, id })
	}, duration)
}

export function postMessage(message: Omit<Message, "id">) {
	return store.postMessage(message)
}

export function useMessages(type: string) {
	if (!store?.channels[type]) {
		store.channels[type] = {
			id: type,
			messages: [],
			removeMessage: (message: Message) => {
				store.removeMessage(message)
			},
		}
	}

	const snap = useSnapshot(store)

	return snap.channels[type]
}
