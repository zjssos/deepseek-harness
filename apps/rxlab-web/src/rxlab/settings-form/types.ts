/**
 * Client-side settings-field presentation for rxlab workbench modules: a hint
 * map turns one settings namespace (value view from `settings.describe`) into
 * a friendly zh form. The SPA hint map — not the serialized schemastery schema
 * — is the authority for labels, controls, and options (enum fidelity over the
 * Remote wire is not guaranteed); the namespace view supplies which fields
 * exist, leaf value types, applies semantics, user overrides, and revision.
 */

/** Rendered control family for one settings field. */
export type SettingsFieldControl = 'select' | 'number' | 'boolean' | 'text' | 'readonly'

/** One select choice for a `select` control. */
export interface SettingsFieldOption {
  /** Raw value stored in the settings namespace. */
  readonly value: string
  /** zh option label. */
  readonly label: string
}

/** Presentation hint for exactly one settings field (keyed by config field name). */
export interface SettingsFieldHint {
  /** zh field label. */
  readonly label: string
  readonly control: SettingsFieldControl
  /** Choices for a `select` control. */
  readonly options?: readonly SettingsFieldOption[]
  /** Suffix shown after the value of numeric fields (e.g. "tokens"). */
  readonly unit?: string
  /** One-line zh explanation rendered under the control. */
  readonly help?: string
}

/** One settings namespace rendered as a titled field group of a module card. */
export interface NamespaceDescriptor {
  /** Registered settings namespace key (e.g. `llm-deepseek`). */
  readonly ns: string
  /** zh section title. */
  readonly title: string
  /** Exact config-field → hint; only listed fields are edited here. */
  readonly fields: Readonly<Record<string, SettingsFieldHint>>
}
