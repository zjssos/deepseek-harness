/**
 * The `rxlab_fitting` storage domain: zod record/draft schemas for the
 * staged refraction exam model and the `defineDomain` spec the
 * FittingController opens. The zod schemas validate at the durable read
 * boundary (per-record layout, version 1) and double as the controller's
 * create/derive validator; the inferred record types mirror the browser-safe
 * wire types in `types.ts`.
 * @module @deepseek-ai/dsh-rxlab-fitting/src/domain
 */

import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { FittingRecordId } from './types.ts'

/** Exam record key; branding has no runtime representation. */
export const fittingRecordId = z
  .string()
  .min(1)
  .max(64)
  .transform(value => value as FittingRecordId)

/** ISO-8601 write instant stamped by the controller, never by callers. */
const updatedAt = z.string()

/** Exam usage; drives lens-type and feature advice downstream. */
export const examUsageSchema = z.enum(['far', 'near', 'computer', 'outdoor', 'all'])

/** One sphere/cylinder reading; the axis belongs to a present cylinder. */
const rxReading = z.object({
  sph: z.number().min(-40).max(40),
  cyl: z.number().min(-10).max(10).optional(),
  axis: z.number().min(0).max(180).optional(),
})

/** A1 问诊/病史. */
const anamnesisData = z.object({
  age: z.number().int().min(0).max(130),
  firstExam: z.boolean(),
  usage: examUsageSchema,
  symptoms: z.array(z.string().min(1).max(60)).max(10).optional(),
  oldGlassesAgeYears: z.number().min(0).max(50).optional(),
  systemicNotes: z.string().max(300).optional(),
})

/** One acuity entry; absent eyes stay absent. */
const vaEntry = z.object({
  farL: z.string().min(1).max(40).optional(),
  farR: z.string().min(1).max(40).optional(),
  nearL: z.string().min(1).max(40).optional(),
  nearR: z.string().min(1).max(40).optional(),
})

/** A2/A3 基线. */
const baselineData = z.object({
  oldGlasses: z
    .object({
      measured: z.boolean(),
      sphL: z.number().optional(),
      sphR: z.number().optional(),
      cylL: z.number().optional(),
      cylR: z.number().optional(),
      axisL: z.number().min(0).max(180).optional(),
      axisR: z.number().min(0).max(180).optional(),
    })
    .optional(),
  nakedVa: vaEntry.optional(),
  withOldVa: vaEntry.optional(),
})

/** B1 客观验光. */
const objectiveData = z.object({
  method: z.enum(['autorefractor', 'retinoscopy']),
  eyeL: rxReading,
  eyeR: rxReading,
})

/** B2 调节放松. */
const cycloplegiaData = z.object({
  method: z.enum(['none', 'fogging', 'cycloplegia']),
  reason: z.string().max(300).optional(),
})

/** C1-C5 单眼主觉验光, per eye. */
const subjectiveEye = z.object({
  mpmvaSph: z.number().min(-40).max(40),
  mpmvaCyl: z.number().min(-10).max(10).optional(),
  duochrome: z.enum(['red', 'green', 'balanced']).optional(),
  jccAxisDelta: z.number().min(-15).max(15).optional(),
  jccCylDelta: z.number().min(-4).max(4).optional(),
  finalSph: z.number().min(-40).max(40),
  finalCyl: z.number().min(-10).max(10).optional(),
  finalAxis: z.number().min(0).max(180).optional(),
  va: z.string().max(40).optional(),
})

/** C1-C5 both eyes. */
const subjectiveData = z.object({ eyeL: subjectiveEye, eyeR: subjectiveEye })

/** C6/C7 双眼平衡与终验. */
const binocularData = z.object({
  balanceDeltaL: z.number().min(-2).max(2),
  balanceDeltaR: z.number().min(-2).max(2),
  finalSphL: z.number().min(-40).max(40),
  finalSphR: z.number().min(-40).max(40),
  duochrome: z.enum(['red', 'green', 'balanced']).optional(),
})

/** C8 试戴. */
const trialData = z.object({
  performed: z.boolean(),
  tolerated: z.boolean().optional(),
  rollbackDiopters: z.number().min(0).max(1).optional(),
  notes: z.string().max(300).optional(),
})

/** C9 下加光. */
const addData = z.object({
  addL: z.number().min(0).max(4),
  addR: z.number().min(0).max(4),
  nearVa: z.string().max(40).optional(),
})

/** C10 瞳距/瞳高. */
const pdMeasureData = z.object({
  pdL: z.number().positive().max(50),
  pdR: z.number().positive().max(50),
  pdH: z.number().positive().max(50).optional(),
  instrument: z.enum(['ruler', 'pupillometer']).optional(),
})

/** One staged exam entry; the closed id discriminant drives every switch. */
export const examStageEntrySchema = z.discriminatedUnion('id', [
  z.object({ id: z.literal('anamnesis'), data: anamnesisData }),
  z.object({ id: z.literal('baseline'), data: baselineData }),
  z.object({ id: z.literal('objective'), data: objectiveData }),
  z.object({ id: z.literal('cycloplegia'), data: cycloplegiaData }),
  z.object({ id: z.literal('subjective'), data: subjectiveData }),
  z.object({ id: z.literal('binocular'), data: binocularData }),
  z.object({ id: z.literal('trial'), data: trialData }),
  z.object({ id: z.literal('add'), data: addData }),
  z.object({ id: z.literal('pdMeasure'), data: pdMeasureData }),
])

/** One stored exam record before the controller mints id and updatedAt. */
export const examRecordDraftSchema = z.object({
  patient: z.string().trim().max(100).optional(),
  date: z.string().trim().max(40).optional(),
  stages: z.array(examStageEntrySchema).min(1),
})

/** Validates every stored record at the durable boundary. */
export const fittingRecordSchema = examRecordDraftSchema.extend({
  id: fittingRecordId,
  updatedAt,
})

/**
 * The fitting domain spec: one `records` table keyed by
 * {@link FittingRecordId}, per-record layout so each exam record is its own
 * disposable document. Version 1 is the first shipped shape of the staged
 * refraction model.
 */
export const fittingDomainSpec = defineDomain({
  name: 'rxlab_fitting',
  version: 1,
  layout: 'per-record',
  tables: {
    records: domainTable<FittingRecordId, z.infer<typeof fittingRecordSchema>>(fittingRecordSchema),
  },
})
