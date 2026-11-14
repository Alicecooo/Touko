import type { InstanceInfo } from "@/state/store";

export function engineReady(instance: InstanceInfo): boolean {
  if (instance.driverKind === "clineAgent") {
    return instance.snapshot.state === "available" && instance.snapshot.authenticated === true;
  }
  return instance.snapshot.state === "available" && instance.snapshot.authenticated !== false;
}
