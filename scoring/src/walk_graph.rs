use memmap2::Mmap;
use std::collections::HashMap;
use std::fs::File;
use std::path::Path;

pub const GRID_CELL_SIZE: f64 = 0.002; // ~200m in degrees

/// Walking graph in CSR format, loaded from walk-graph.bin.
/// All arrays are owned (copied from mmap) so the compiler can prove no aliasing
/// with the Dijkstra best_buf, enabling better auto-vectorization.
pub struct WalkGraph {
    _mmap: Mmap,
    pub node_count: u32,
    pub edge_count: u32,
    /// Interleaved [lat, lon, lat, lon, ...] for each node — owned copy
    pub coords: Vec<f64>,
    /// CSR offset array: edges for node i at offsets[i]..offsets[i+1] — owned copy
    pub offsets: Vec<u32>,
    /// Edge targets (deinterleaved from binary for better cache)
    pub edge_targets: Vec<u32>,
    /// Edge distances in centimeters (deinterleaved)
    pub edge_dist_cm: Vec<u32>,
    /// Spatial grid for nearest-node lookup: (cx, cy) → node indices
    pub grid: HashMap<(i32, i32), Vec<u32>>,
}

// All data is in owned Vecs now — Send+Sync is automatic.
// But we keep _mmap alive to avoid re-reading, so we still need these.
unsafe impl Send for WalkGraph {}
unsafe impl Sync for WalkGraph {}

impl WalkGraph {
    pub fn load(path: &Path) -> Self {
        let file = File::open(path).unwrap_or_else(|e| {
            panic!("Cannot open walk graph at {}: {}", path.display(), e);
        });
        let mmap = unsafe { Mmap::map(&file).expect("mmap failed") };
        let data = &mmap[..];

        let node_count = u32::from_le_bytes(data[0..4].try_into().unwrap());
        let edge_count = u32::from_le_bytes(data[4..8].try_into().unwrap());

        // Copy coords into owned Vec (eliminates pointer indirection in hot loop)
        let coords_start = 8;
        let coords_bytes = node_count as usize * 2 * 8;
        let n_coords = node_count as usize * 2;
        let mut coords = vec![0.0f64; n_coords];
        // SAFETY: `coords` is a freshly allocated Vec<f64> of length `n_coords`, so
        // `coords.as_mut_ptr() as *mut u8` is valid for `coords_bytes` (= n_coords * 8) bytes.
        // The source slice `data[coords_start..]` comes from a separate mmap region, so
        // source and destination do not overlap. Both are byte-aligned.
        let coords_byte_slice = unsafe {
            std::slice::from_raw_parts(coords.as_mut_ptr() as *mut u8, coords_bytes)
        };
        unsafe {
            std::ptr::copy_nonoverlapping(
                data[coords_start..].as_ptr(),
                coords_byte_slice.as_ptr() as *mut u8,
                coords_bytes,
            );
        }

        // Copy offsets into owned Vec
        let offsets_start = coords_start + coords_bytes;
        let n_offsets = node_count as usize + 1;
        let offsets_bytes = n_offsets * 4;
        let mut offsets = vec![0u32; n_offsets];
        // SAFETY: `offsets` is a freshly allocated Vec<u32> of length `n_offsets`, so
        // `offsets.as_mut_ptr() as *mut u8` is valid for `offsets_bytes` (= n_offsets * 4) bytes.
        // The source slice `data[offsets_start..]` comes from a separate mmap region, so
        // source and destination do not overlap. u8 has no alignment requirements.
        unsafe {
            std::ptr::copy_nonoverlapping(
                data[offsets_start..].as_ptr(),
                offsets.as_mut_ptr() as *mut u8,
                offsets_bytes,
            );
        }

        // Read edges — keep both interleaved (for hot loop) and deinterleaved (for compatibility)
        let edges_start = offsets_start + offsets_bytes;
        let mut edge_targets = Vec::with_capacity(edge_count as usize);
        let mut edge_dist_cm = Vec::with_capacity(edge_count as usize);
        for i in 0..edge_count as usize {
            let off = edges_start + i * 8;
            let to_idx = u32::from_le_bytes(data[off..off + 4].try_into().unwrap());
            let dist = u32::from_le_bytes(data[off + 4..off + 8].try_into().unwrap());
            edge_targets.push(to_idx);
            edge_dist_cm.push(dist);
        }

        // Build spatial grid
        let mut grid: HashMap<(i32, i32), Vec<u32>> = HashMap::new();
        for i in 0..node_count as usize {
            let lat = coords[i * 2];
            let lon = coords[i * 2 + 1];
            let cx = (lon / GRID_CELL_SIZE).floor() as i32;
            let cy = (lat / GRID_CELL_SIZE).floor() as i32;
            grid.entry((cx, cy)).or_default().push(i as u32);
        }

        Self {
            _mmap: mmap,
            node_count,
            edge_count,
            coords,
            offsets,
            edge_targets,
            edge_dist_cm,
            grid,
        }
    }

    #[inline(always)]
    pub fn lat(&self, node: u32) -> f64 {
        self.coords[node as usize * 2]
    }

    #[inline(always)]
    pub fn lon(&self, node: u32) -> f64 {
        self.coords[node as usize * 2 + 1]
    }
}
