import "@fontsource-variable/manrope";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";

export const metadata = {
  title: "The PaperHands Arena",
  description: "A psychological survival game with a shared NEAR stake vault.",
};

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
