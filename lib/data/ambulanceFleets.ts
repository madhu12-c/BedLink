import demoUsers from '@/lib/auth/demo-users.json';

/**
 * Ambulance fleets BedLink is built to plug into. BedLink doesn't run ambulances: it is the bed
 * layer any fleet's crews use, each crew as one login (web) or one Telegram link, nothing to
 * install. These are target fleets, not signed partners; the demo ambulance accounts are linked
 * to them (lib/auth/demo-users.json, "fleet" and "vehicle") to show how a crew of each one works.
 * Fleet sizes from public reports, Oct 2026.
 */
export type FleetId = 'mems108' | 'redhealth' | 'dial1298';

export type VehicleType = 'ALS' | 'BLS';

export interface AmbulanceFleet {
  id: FleetId;
  /** Short name on badges */
  name: string;
  operator: string;
  kind: 'government' | 'private';
  ambulances: number;
  /** Where it runs */
  coverage: string;
  /** What the fleet is made of, in one line */
  detail: string;
  /** How its crews would use BedLink */
  connects: string;
}

export const AMBULANCE_FLEETS: AmbulanceFleet[] = [
  {
    id: 'mems108',
    name: '108 MEMS',
    operator: 'Sumeet SSG BVG Maharashtra EMS (for the Govt. of Maharashtra)',
    kind: 'government',
    ambulances: 1756,
    coverage: 'All of Maharashtra, free for patients',
    detail: '255 advanced (ALS), 1,274 basic (BLS), 36 neonatal, 166 bikes, 25 boats; rollout from Nov 2025',
    connects: 'Control room and every crew sign in to BedLink; crews follow holds on Telegram'
  },
  {
    id: 'redhealth',
    name: 'RED.Health',
    operator: 'RED.Health (formerly StanPlus)',
    kind: 'private',
    ambulances: 5000,
    coverage: '550+ cities in India',
    detail: 'Tech-enabled network of 5,000+ private ambulances',
    connects: 'Their dispatch asks BedLink to rank hospitals and hold the bed; crews get a held bed, not a phone list'
  },
  {
    id: 'dial1298',
    name: 'Dial 1298',
    operator: 'Ziqitza Health Care',
    kind: 'private',
    ambulances: 50,
    coverage: 'Mumbai',
    detail: 'About 50 ambulances in Mumbai; richer patients pay more so poorer patients ride cheaper',
    connects: 'Crews sign in or use the Telegram link, like any other fleet'
  }
];

export const VEHICLE_LABELS: Record<VehicleType, string> = {
  ALS: 'Advanced life support',
  BLS: 'Basic life support'
};

export function getFleet(id: string | null | undefined): AmbulanceFleet | null {
  return AMBULANCE_FLEETS.find((f) => f.id === id) ?? null;
}

/** The fleet (and vehicle) a signed-in crew belongs to, from the demo accounts list. */
export function fleetForEmail(
  email: string | null | undefined
): { fleet: AmbulanceFleet; vehicle: VehicleType | null } | null {
  if (!email) return null;
  const account = (demoUsers as { email: string; fleet?: string; vehicle?: string }[]).find(
    (u) => u.email.toLowerCase() === email.toLowerCase()
  );
  const fleet = getFleet(account?.fleet);
  if (!fleet) return null;
  const vehicle = account?.vehicle === 'ALS' || account?.vehicle === 'BLS' ? account.vehicle : null;
  return { fleet, vehicle };
}

/** Ambulances across all listed fleets (for "any fleet plugs in" on the dispatch screen). */
export const TOTAL_FLEET_AMBULANCES = AMBULANCE_FLEETS.reduce((sum, f) => sum + f.ambulances, 0);
