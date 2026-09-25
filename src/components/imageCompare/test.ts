import { proxy } from "valtio";
import { computed } from "valtio-reactive";

const state = proxy({ a: 5, b: 2, c: "hello" })

const derived = computed({
    sum() {
        console.log("updating sum")
        return state.a + state.b
    },
    sumSum() {
        console.log("updating sumSum")
        return derived.sum * derived.sum
    }
})

console.log("sum", derived.sum)
console.log("sum", derived.sumSum)

console.log("changing a")
state.a = 9

console.log("sum", derived.sum)
console.log("sum", derived.sumSum)
