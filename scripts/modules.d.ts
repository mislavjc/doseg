declare module "osm-pbf-parser" {
  import type { Duplex } from "node:stream"

  export default function createParser(): Duplex
}

// through2 types its streams via readable-stream, which ships no types; it mirrors node:stream.
declare module "readable-stream" {
  export { Transform, type TransformOptions } from "node:stream"
}
