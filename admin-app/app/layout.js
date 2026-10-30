import "./globals.css";

export const metadata = {
  title: "Caption Lab Admin",
  description: "Administer Caption Lab content and inspect generation activity.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
