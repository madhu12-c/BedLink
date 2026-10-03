import { useSyncExternalStore } from 'react';
import { getLiveSnapshot, getServerLiveSnapshot, LivePosition, subscribeLive } from './liveTracking';

/** Every ambulance sharing its live position right now (any screen, any device). */
export function useLiveAmbulances(): LivePosition[] {
  return useSyncExternalStore(subscribeLive, getLiveSnapshot, getServerLiveSnapshot);
}
