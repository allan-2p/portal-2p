import { useSyncExternalStore } from "react";

let query = "";
const listeners = new Set<() => void>();

export function setGlobalSearch(v: string) {
  query = v;
  listeners.forEach((l) => l());
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

const getSnap = () => query;

export function useGlobalSearch() {
  return useSyncExternalStore(subscribe, getSnap, getSnap);
}
