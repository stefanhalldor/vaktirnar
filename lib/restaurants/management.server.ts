import 'server-only'
import { z } from 'zod'
import { getAdmin } from '@/lib/supabase/admin'
import { requireRestaurantRole } from './server'

const uuid = z.string().uuid()
const statusSchema = z.object({ splitId: uuid, itemId: uuid, expectedRevision: z.number().int().positive(), status: z.enum(['nytt','i_vinnslu','afgreitt']) }).strict()

export async function readRestaurantOperations(venueId: string) {
  const user = await requireRestaurantRole('veitingastadir_starfsfolk')
  const id = uuid.parse(venueId)
  const { data, error } = await getAdmin().rpc('restaurant_operational_view_v1', { p_actor_id: user.id, p_venue_id: id })
  if (error) throw new Error(error.message)
  return data
}

export async function setRestaurantOrderStatus(input: unknown) {
  const user = await requireRestaurantRole('veitingastadir_starfsfolk')
  const value = statusSchema.parse(input)
  const { data, error } = await getAdmin().rpc('restaurant_set_order_status_v1', {
    p_actor_id: user.id, p_split_id: value.splitId, p_item_id: value.itemId,
    p_expected_revision: value.expectedRevision, p_status: value.status,
  })
  if (error) throw new Error(error.message)
  return data
}

export async function assignRestaurantPreorder(input: unknown) {
  const user = await requireRestaurantRole('veitingastadir_starfsfolk')
  const value = z.object({ requestId: uuid, visitId: uuid, expectedVisitRevision: z.number().int().positive(), tableSessionId: uuid, expectedSessionRevision: z.number().int().positive() }).strict().parse(input)
  const { data, error } = await getAdmin().rpc('restaurant_assign_preorder_table_v1', {
    p_actor_id: user.id, p_request_id: value.requestId, p_visit_id: value.visitId,
    p_expected_visit_revision: value.expectedVisitRevision, p_table_session_id: value.tableSessionId,
    p_expected_session_revision: value.expectedSessionRevision,
  })
  if (error) throw new Error(error.message)
  return data
}

export async function enableRestaurantCapability(input: unknown) {
  const user = await requireRestaurantRole('veitingastadir')
  const value = z.object({ spaceId: uuid, businessProfileId: uuid }).strict().parse(input)
  const { data, error } = await getAdmin().rpc('restaurant_enable_capability_v1', {
    p_actor_id: user.id, p_space_id: value.spaceId, p_business_profile_id: value.businessProfileId,
  })
  if (error) throw new Error(error.message)
  return data
}

const ownerBase = { spaceId: uuid, businessProfileId: uuid }
const ownerCommandSchema = z.discriminatedUnion('command', [
  z.object({ ...ownerBase, command: z.literal('venue'), venueId: uuid.nullable(), expectedRevision: z.number().int().positive().nullable(), slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), displayName: z.string().trim().min(1).max(120), timezone: z.string().trim().min(1).max(80) }).strict(),
  z.object({ ...ownerBase, command: z.literal('table'), venueId: uuid, tableId: uuid.nullable(), expectedRevision: z.number().int().positive().nullable(), label: z.string().trim().min(1).max(40), active: z.boolean() }).strict(),
  z.object({ ...ownerBase, command: z.literal('menu'), venueId: uuid, menuId: uuid.nullable(), expectedRevision: z.number().int().positive().nullable(), title: z.string().trim().min(1).max(120), currency: z.enum(['ISK','EUR','USD','GBP','DKK','NOK','SEK']), items: z.array(z.object({ id: uuid.optional(), name: z.string().trim().min(1).max(200), description: z.string().max(1000), priceMinor: z.number().int().nonnegative(), available: z.boolean(), modifiers: z.array(z.unknown()) }).strict()).min(1).max(500) }).strict(),
  z.object({ ...ownerBase, command: z.literal('open_table'), venueId: uuid, tableId: uuid, menuId: uuid, menuVersion: z.number().int().positive() }).strict(),
])

export async function mutateRestaurantOwner(input: unknown) {
  const user = await requireRestaurantRole('veitingastadir')
  const value = ownerCommandSchema.parse(input)
  const shared = { p_actor_id: user.id, p_space_id: value.spaceId, p_business_profile_id: value.businessProfileId }
  const call = value.command === 'venue'
    ? getAdmin().rpc('restaurant_upsert_venue_v1', { ...shared, p_venue_id: value.venueId, p_expected_revision: value.expectedRevision, p_slug: value.slug, p_display_name: value.displayName, p_timezone: value.timezone })
    : value.command === 'table'
      ? getAdmin().rpc('restaurant_upsert_table_v1', { ...shared, p_venue_id: value.venueId, p_table_id: value.tableId, p_expected_revision: value.expectedRevision, p_label: value.label, p_active: value.active })
      : value.command === 'menu'
        ? getAdmin().rpc('restaurant_publish_menu_v1', { ...shared, p_venue_id: value.venueId, p_menu_id: value.menuId, p_expected_revision: value.expectedRevision, p_title: value.title, p_currency: value.currency, p_items: value.items })
        : getAdmin().rpc('restaurant_open_table_v1', { ...shared, p_venue_id: value.venueId, p_table_id: value.tableId, p_menu_id: value.menuId, p_menu_version: value.menuVersion })
  const { data, error } = await call
  if (error) throw new Error(error.message)
  return data
}
