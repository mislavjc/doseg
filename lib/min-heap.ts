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
    const d = this.data
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (d[parent].time <= d[i].time) break
      const tmp = d[parent]
      d[parent] = d[i]
      d[i] = tmp
      i = parent
    }
  }

  private sinkDown(i: number) {
    const d = this.data
    const n = d.length
    while (true) {
      let smallest = i
      const left = 2 * i + 1
      const right = 2 * i + 2
      if (left < n && d[left].time < d[smallest].time) smallest = left
      if (right < n && d[right].time < d[smallest].time) smallest = right
      if (smallest === i) break
      const tmp = d[smallest]
      d[smallest] = d[i]
      d[i] = tmp
      i = smallest
    }
  }
}
