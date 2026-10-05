import BN from "bn.js";
import { Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";

import { dueCrankJobs } from "../src/crank.js";
import { encodeFixed } from "../src/format.js";
import type { ConsignmentAccount, ContainerAccount } from "../src/types.js";

const NOW = 1_800_000_000;
const addr = () => Keypair.generate().publicKey;

const container = (status: string, cutoff: number) => ({
  address: addr(),
  account: {
    status: { [status]: {} },
    cutoffTs: new BN(cutoff),
    code: encodeFixed("LAG-1014", 12),
  } as unknown as ContainerAccount,
});

const consignment = (status: string, deadline: number) => ({
  address: addr(),
  account: {
    status: { [status]: {} },
    reviewDeadline: new BN(deadline),
  } as unknown as ConsignmentAccount,
});

describe("dueCrankJobs", () => {
  it("closes open containers at or after cut-off (program: now >= cutoff_ts)", () => {
    const jobs = dueCrankJobs(
      [container("open", NOW), container("open", NOW + 1), container("closed", NOW - 100)],
      [],
      NOW,
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.kind).toBe("closeBooking");
    expect(jobs[0]?.label).toBe("container LAG-1014");
  });

  it("auto-approves received consignments strictly after the deadline (program: now > deadline)", () => {
    const due = consignment("received", NOW - 1);
    const jobs = dueCrankJobs(
      [],
      [
        due,
        consignment("received", NOW),
        consignment("approved", NOW - 100),
        consignment("disputed", 0),
      ],
      NOW,
    );
    expect(jobs.map((j) => [j.kind, j.address.toBase58()])).toEqual([
      ["autoApprove", due.address.toBase58()],
    ]);
  });
});
