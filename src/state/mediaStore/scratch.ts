import { useProxyRefState } from "@/hooks/valtioHooks"
import chance from "chance"
import { useCallback, useEffect, useMemo, useRef } from "react"
import { proxy, snapshot } from "valtio"
import { batch, computed, effect } from "valtio-reactive"
import { subscribeKey } from "valtio/utils"

export const store = proxy({
    items: [] as MediaItem[],
})

for (let i = 0; i < 12; i++) {
    addItem()
}

export function addItem() {
    console.log("add item")
    const item = randItem()
    store.items.push(item)
}

/*
    requirements:
        initial load retreives items from store
        changes will need to be synced to the store
        So except for the first load, this is a one way sync

        there could be a mechanism for making sure only one instance the collection exists

        mutation of collection specific data can occur directly on the item and should be propogated
            back to the store
        base media item properties should be immutable

        I think the returned item should be a class (state controller)
*/
// export function useCollection(cid: "ic"): { id: "ic"; items: IcItem[] }
// export function useCollection(cid: "md"): { id: "md"; items: MdItem[] }
export function useCollection(cid: "ic" | "md") {
    const Item = useMemo(() => {
        console.log("getItemFactory", cid)
        return getItemFactory(cid)
    }, [cid])

    const getItems = useCallback(() => {
        console.log("getItems", cid)
        return store.items
            .filter((item) => cid in item.$collection)
            .map((item) => new Item(item)) as unknown as MdItem[] | IcItem[]
    }, [Item, cid])

    const collectionState = useProxyRefState(() => ({
        id: cid,
        items: getItems(),
    }))

    useEffect(() => {
        console.log("subscribing", cid)
        const unsub = subscribeKey(store.items, "length", () => {
            console.log("length sub callback", cid)
            collectionState.items = getItems()
        })
        return () => {
            console.log("unsubscribing", cid)
            unsub()
        }
    }, [collectionState, getItems, cid])

    return collectionState
}

// this would actually take a default value param as well
function getItemFactory(cid: "ic" | "md") {
    class Item {
        state: MediaItem

        constructor(source: MediaItem) {
            this.state = source
        }

        get id() {
            return this.state.id
        }
        get name() {
            return this.state.name
        }
    }
    // this would use the default value keys
    for (const key of COLL_PROPS[cid]) {
        console.log("adding", key, "to", cid)
        Object.defineProperty(Item.prototype, key, {
            enumerable: true,
            configurable: false,
            get() {
                return this.state.$collection?.[cid]?.[
                    key as keyof MediaItem["$collection"][typeof cid]
                ]
            },
            set(value) {
                // this might actually be an error
                if (!this.state.$collection[cid]) {
                    this.state.$collection[cid] = {}
                }
                this.state.$collection[cid][key] = value
            },
        })
    }

    return Item
}

const BASE_PROPS = ["id", "name"]
const COLL_PROPS = {
    ic: ["pin", "value"],
    md: ["pin", "something"],
}

interface MediaItem {
    id: string
    name: string
    $collection: {
        ic?: Omit<IcItem, keyof CollectionItem>
        md?: Omit<MdItem, keyof CollectionItem>
    }
}
interface CollectionItem {
    id: string
    name: string
}
interface MdItem extends CollectionItem {
    pin: number
    something: string
}
interface IcItem extends CollectionItem {
    pin: number
    value: number
}

function randItem() {
    return {
        id: chance().guid(),
        name: chance().sentence({
            words: 2,
        }),
        $collection: chance().pickone([randMd, randIc])(),
    }
}

function randMd() {
    return {
        md: {
            pin: chance().integer({ min: 1, max: 100 }),
            something: chance().string({ length: 10 }),
        },
    }
}

function randIc() {
    return {
        ic: {
            pin: chance().integer({ min: 1, max: 100 }),
            value: chance().integer({ min: 0, max: 2000 }),
        },
    }
}
