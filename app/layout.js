import "./globals.css";

export const metadata = {
  title: "Caption Lab",
  description: "Discover, rate, and generate captions for memorable images.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
