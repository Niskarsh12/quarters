import "@fontsource-variable/manrope";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";

export const metadata = {
  title: "Quarters · AI Vending Machine",
  description: "Unlock a report or render a chart with a few cents from your Coin Jar.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="dark">
      <body>{children}</body>
    </html>
  );
}
