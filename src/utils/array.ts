function clear<T>(arr: T[]) {
	return arr.splice(0, arr.length)
}

function remove<T>(arr: T[], item: T) {
	const index = arr.indexOf(item)
	let removed = 0
	if (index > -1) {
		removed = arr.splice(index, 1).length
	}
	return !!removed
}

function set<T>(arr: T[], items: T[]) {
	arr.splice(0, arr.length, ...items)
}

function sum<T>(arr: T[], fn: (item: T) => number) {
	return arr.reduce((acc, item) => acc + fn(item), 0)
}

const va = {
	clear,
	remove,
	set,
	sum,
}

export default va
