import { describe, expect, it } from 'vitest'
import { appendPrice, extractListing, latestPrice } from '../src/extract.ts'

describe('extractListing', () => {
  it('extracts frame attributes from a real BOLON collected title', () => {
    const result = extractListing({
      title: 'BOLON暴龙近视眼镜钛框男复古休闲镜框可配度数BA7009 B15',
      selectedSku: 'BA7009B15-哑黑银',
    })
    expect(result.kind).toBe('frame')
    expect(result.attrs.brand).toBe('BOLON')
    expect(result.attrs.model).toBe('BA7009B15')
    expect(result.attrs.material).toBe('titanium')
    expect(result.attrs.gender).toBe('male')
    expect(result.attrs.style).toBe('retro')
    expect(result.attrs.color).toBe('哑黑银')
  })

  it('distinguishes pure titanium from beta titanium and alloy marketing terms', () => {
    const pure = extractListing({ title: '博士眼镜纯钛镜框 男 商务 半框' })
    expect(pure.attrs.material).toBe('pure-titanium')
    const beta = extractListing({ title: 'BOLON暴龙眼镜光学镜女近视眼镜框男β钛镜腿 BT6018B16' })
    expect(beta.attrs.material).toBe('beta-titanium')
    expect(beta.attrs.gender).toBe('female')
    const alloy = extractListing({ title: '眼镜架 铝镁合金 全框 男' })
    expect(alloy.attrs.material).toBe('metal-alloy')
  })

  it('reads frame geometry from the spec marking and the weight from the title', () => {
    const result = extractListing({
      title: '普莱斯近视眼镜框 纯钛 高端商务半框 超轻8g 男士眼镜架 52□18-140',
    })
    expect(result.attrs.weightG).toBe(8)
    expect(result.attrs.lensWidth).toBe(52)
    expect(result.attrs.bridgeWidth).toBe(18)
    expect(result.attrs.templeLength).toBe(140)
  })

  it('rejects implausible frame-size markings instead of storing noise', () => {
    const result = extractListing({ title: '眼镜框 2024-10-140 促销 方框' })
    expect(result.attrs.lensWidth).toBeUndefined()
    expect(result.attrs.bridgeWidth).toBeUndefined()
    expect(result.attrs.templeLength).toBeUndefined()
  })

  it('prefers the spec parameter table over title heuristics', () => {
    const result = extractListing({
      title: '京东京造近视眼镜框 商务 超轻钛 全框',
      params: [
        { name: '镜架材质', value: 'β钛' },
        { name: '镜圈宽度', value: '54mm' },
        { name: '鼻梁宽度', value: '19mm' },
        { name: '镜腿长度', value: '142mm' },
        { name: '镜架总宽', value: '141mm' },
        { name: '重量', value: '12.5g' },
        { name: '鼻托', value: '独立鼻托' },
      ],
    })
    expect(result.attrs.material).toBe('beta-titanium')
    expect(result.attrs.lensWidth).toBe(54)
    expect(result.attrs.bridgeWidth).toBe(19)
    expect(result.attrs.templeLength).toBe(142)
    expect(result.attrs.totalWidth).toBe(141)
    expect(result.attrs.weightG).toBe(12.5)
    expect(result.attrs.nosePad).toBe('separate')
  })

  it('classifies a lens-only listing and carries its optics vocabulary', () => {
    const result = extractListing({
      title: '蔡司镜片1.67非球面防蓝光渐进 近视眼镜片',
    })
    expect(result.kind).toBe('lens')
    expect(result.attrs.refractiveIndex).toBe('1.67')
    expect(result.attrs.lensDesign).toBe('aspheric')
    expect(result.attrs.lensType).toBe('progressive')
    expect(result.attrs.lensFunctions).toContain('blue-light')
  })

  it('maps a bundle listing to its frame with the rim construction', () => {
    const bundle = extractListing({
      title: '蔡司镜片 眼镜近视 纯钛镜框 可配度数 枪色 欧拿纯钛眼镜框（试戴）',
    })
    expect(bundle.kind).toBe('frame')
    expect(bundle.attrs.material).toBe('pure-titanium')
    expect(bundle.attrs.frameType).toBeUndefined()

    const rimless = extractListing({ title: '钛架无框眼镜女近视可配度数防蓝光眼睛镜架121213' })
    expect(rimless.attrs.frameType).toBe('rimless')
    const semi = extractListing({ title: 'LOHO超轻钛架眼镜防蓝光近视商务休闲全框' })
    expect(semi.attrs.frameType).toBe('full-rim')
    expect(semi.attrs.style).toBe('business')
  })

  it('falls back to a product row when no lens or frame signal exists', () => {
    const result = extractListing({ title: '某品牌清洁布 眼镜 accessories 擦镜布' })
    expect(result.kind).toBe('product')
    expect(result.attrs.material).toBeUndefined()
  })

  it('leaves attributes absent when the title carries no recognizable signal', () => {
    const result = extractListing({ title: 'XYZ123 型号 A' })
    expect(result.kind).toBe('product')
    expect(result.attrs.brand).toBe('XYZ123')
    expect(result.attrs.gender).toBeUndefined()
    expect(result.attrs.style).toBeUndefined()
    expect(result.attrs.material).toBeUndefined()
  })
})

describe('appendPrice', () => {
  const entry = { value: 399, capturedAt: '2026-09-09T00:00:00.000Z', captureId: 'c1' }

  it('appends a changed price and replaces a repeated latest value', () => {
    const first = appendPrice(undefined, entry)
    expect(first).toEqual([{ ...entry, source: 'collected' }])
    const changed = appendPrice(first, { ...entry, value: 359 })
    expect(changed.map(item => item.value)).toEqual([399, 359])
    const repeated = appendPrice(changed, { ...entry, value: 359, capturedAt: '2026-09-10T00:00:00.000Z' })
    expect(repeated.map(item => item.value)).toEqual([399, 359])
    expect(repeated[1]?.capturedAt).toBe('2026-09-10T00:00:00.000Z')
  })

  it('caps the history at 200 entries by dropping the oldest', () => {
    let history = appendPrice(undefined, entry)
    for (let value = 1; value <= 205; value++) {
      history = appendPrice(history, { ...entry, value })
    }
    expect(history.length).toBe(200)
    expect(history[0]?.value).toBe(6)
  })
})

describe('latestPrice', () => {
  it('reads the last entry and tolerates absent history', () => {
    expect(latestPrice(undefined)).toBeUndefined()
    expect(latestPrice([{ value: 100 }, { value: 80 }])).toBe(80)
  })
})
