import { useEffect, useState } from "react";
import * as api from "../api/client";

export type Health = Awaited<ReturnType<typeof api.getHealth>>;

// What this server has configured. Everything off until known, and off if
// the check fails - better to hide a feature than offer one that errors.
const OFF: Health = { status: "unknown", extraction: false, webhooks: false, provisioning: false, github: false };

export function useHealth(): Health {
  const [health, setHealth] = useState<Health>(OFF);
  useEffect(() => {
    api
      .getHealth()
      .then((h) => setHealth({ ...OFF, ...h }))
      .catch(() => setHealth(OFF));
  }, []);
  return health;
}
