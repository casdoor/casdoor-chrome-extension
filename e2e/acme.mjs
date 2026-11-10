// The made-up company Acme: the accounts of its systems, and alice, who has them in Casdoor

import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

export const accounts = {
  oa: {alice: "Oa-Secret-2026"},
  crm: {alice: "Crm-Secret-2026", "alice.sales": "Crm-Sales-2026"},
  erp: {alice: "Erp-Secret-2026"},
};

export const alice = {name: "alice", password: "Alice-Demo-2026", displayName: "Alice Chen"};

/** Whether the module is the script that node runs */
export function isMain(meta) {
  return !!process.argv[1] && resolve(fileURLToPath(meta.url)).toLowerCase() === resolve(process.argv[1]).toLowerCase();
}
