/// 4-ary min-heap using parallel Vec<f64> (times) + Vec<u32> (nodes).
/// 4-ary has fewer cache misses than binary for large heaps because
/// the tree is shallower (log4 vs log2), trading more comparisons per level
/// for fewer levels of pointer-chasing.
pub struct FlatHeap {
    times: Vec<f64>,
    nodes: Vec<u32>,
}

const ARITY: usize = 4;

impl FlatHeap {
    pub fn new() -> Self {
        Self {
            times: Vec::new(),
            nodes: Vec::new(),
        }
    }

    #[inline(always)]
    pub fn is_empty(&self) -> bool {
        self.times.is_empty()
    }

    #[inline(always)]
    pub fn push(&mut self, time: f64, node: u32) {
        self.times.push(time);
        self.nodes.push(node);
        self.bubble_up(self.times.len() - 1);
    }

    #[inline(always)]
    pub fn peek_time(&self) -> f64 {
        self.times[0]
    }

    #[inline(always)]
    pub fn peek_node(&self) -> u32 {
        self.nodes[0]
    }

    #[inline(always)]
    pub fn pop(&mut self) {
        let n = self.times.len() - 1;
        if n > 0 {
            self.times[0] = self.times[n];
            self.nodes[0] = self.nodes[n];
        }
        self.times.truncate(n);
        self.nodes.truncate(n);
        if n > 0 {
            self.sink_down(0);
        }
    }

    #[allow(dead_code)]
    pub fn clear(&mut self) {
        self.times.clear();
        self.nodes.clear();
    }

    #[inline(always)]
    fn bubble_up(&mut self, mut i: usize) {
        while i > 0 {
            let parent = (i - 1) / ARITY;
            if self.times[parent] <= self.times[i] {
                break;
            }
            self.times.swap(parent, i);
            self.nodes.swap(parent, i);
            i = parent;
        }
    }

    #[inline(always)]
    fn sink_down(&mut self, mut i: usize) {
        let n = self.times.len();
        loop {
            let first_child = i * ARITY + 1;
            if first_child >= n {
                break;
            }
            let last_child = (first_child + ARITY).min(n);

            // Find smallest child
            let mut s = first_child;
            let mut s_time = self.times[first_child];
            for c in (first_child + 1)..last_child {
                if self.times[c] < s_time {
                    s = c;
                    s_time = self.times[c];
                }
            }

            if s_time >= self.times[i] {
                break;
            }
            self.times.swap(s, i);
            self.nodes.swap(s, i);
            i = s;
        }
    }
}
