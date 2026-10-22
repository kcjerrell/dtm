import MediaStore from "@/state/mediaStore"

function _initStore() {
    const _collection = MediaStore.defineCollection("icompare", { pin: null as number | null }, {})
}
