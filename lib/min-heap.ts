export interface HeapEntry {
  time: number
  key: string
}

export class MinHeap {
  private data: HeapEntry[] = []

  get size() {
    return this.data.length
  }

  push(entry: HeapEntry) {
    this.data.push(entry)
    this.bubbleUp(this.data.length - 1)
  }

  pop(): HeapEntry | undefined {
    if (this.data.length === 0) return undefined
    const top = this.data[0]
    const last = this.data.pop()!
    if (this.data.length > 0) {
      this.data[0] = last
      this.sinkDown(0)
    }
    return top
  }

  private bubbleUp(i: number) {
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.data[parent].time <= this.data[i].time) break
      ;[this.data[parent], this.data[i]] = [this.data[i], this.data[parent]]
      i = parent
    }
  }

  private sinkDown(i: number) {
    const n = this.data.length
    while (true) {
      let smallest = i
      const left = 2 * i + 1
      const right = 2 * i + 2
      if (left < n && this.data[left].time < this.data[smallest].time)
        smallest = left
      if (right < n && this.data[right].time < this.data[smallest].time)
        smallest = right
      if (smallest === i) break
      ;[this.data[smallest], this.data[i]] = [this.data[i], this.data[smallest]]
      i = smallest
    }
  }
}
