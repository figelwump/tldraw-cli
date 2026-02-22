import { writeFile } from 'node:fs/promises'

import { Resvg } from '@resvg/resvg-js'

export type PngRenderOptions = {
  scale?: number
}

export function renderPngFromSvg(svg: string, options: PngRenderOptions = {}): Buffer {
  const scale = options.scale ?? 1
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error(`Invalid PNG scale: ${scale}. Must be a positive number.`)
  }

  const resvg = new Resvg(svg, {
    fitTo: {
      mode: 'zoom',
      value: scale
    }
  })

  return resvg.render().asPng()
}

export async function writePngFile(
  outputPath: string,
  svg: string,
  options: PngRenderOptions = {}
): Promise<void> {
  const png = renderPngFromSvg(svg, options)
  await writeFile(outputPath, png)
}
