import MediaStore from "@/state/mediaStore";

function initStore() {
    const collection = MediaStore.defineCollection("icompare",
        { pin: null as number | null },
        {
            
        }
    )
}