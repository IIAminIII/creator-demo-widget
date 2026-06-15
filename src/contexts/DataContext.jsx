import { createContext, useContext } from "react";

export const DataContext = createContext(null);

export function useCreator() {
  const context = useContext(DataContext);

  if (!context) {
    throw new Error("useCreator must be used within a DataProvider.");
  }

  return context;
}
