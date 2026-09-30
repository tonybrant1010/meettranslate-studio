import { Toaster } from "sonner";
import TranslatorStudio from "@/pages/TranslatorStudio";

export default function App() {
  return (
    <>
      <TranslatorStudio />
      <Toaster
        theme="dark"
        position="top-center"
        toastOptions={{
          style: {
            background: "#191D27",
            border: "1px solid #242A37",
            color: "#E8EAF0",
          },
        }}
      />
    </>
  );
}
