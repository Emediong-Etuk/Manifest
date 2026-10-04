"use client";

import { createContext, useContext } from "react";

import { DISCONNECTED, type ManifestWallet } from "./types";

export const WalletContext = createContext<ManifestWallet>(DISCONNECTED);

export function useWallet(): ManifestWallet {
  return useContext(WalletContext);
}
