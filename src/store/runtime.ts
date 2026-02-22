import { Store, type SerializedStore } from '@tldraw/store'
import {
  createTLSchema,
  defaultBindingSchemas,
  defaultShapeSchemas,
  type TLAsset,
  type TLRecord,
  type TLStore,
  type TLStoreProps,
  type TLStoreSchema
} from '@tldraw/tlschema'

const DEFAULT_SCHEMA = createTLSchema({
  bindings: defaultBindingSchemas,
  shapes: defaultShapeSchemas
})

const DEFAULT_STORE_PROPS: TLStoreProps = {
  assets: {
    remove: async () => Promise.resolve(),
    resolve: (asset: TLAsset) => asset.props.src,
    upload: async () => ({ src: '' })
  },
  defaultName: '',
  onMount: () => {}
}

export function getDefaultStoreSchema(): TLStoreSchema {
  return DEFAULT_SCHEMA
}

export function createHeadlessStore(initialData?: SerializedStore<TLRecord>): TLStore {
  return new Store<TLRecord, TLStoreProps>({
    props: DEFAULT_STORE_PROPS,
    schema: DEFAULT_SCHEMA,
    ...(initialData ? { initialData } : {})
  })
}
