"use client";

import { SWRConfig } from "swr";

const fetcher = (url) => fetch(url).then((r) => r.json());

export default function Providers({ children }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        dedupingInterval: 5000,
        revalidateOnFocus: false,
        revalidateOnReconnect: true,
        keepPreviousData: true,
      }}
    >
      {children}
    </SWRConfig>
  );
}
