import { createContext, useContext } from "react";

export const ReaderContext = createContext(null);

export function useReader() {
  return useContext(ReaderContext);
}
