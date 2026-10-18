import Image from "next/image";

import { BRAND } from "@/lib/brand";
import gleanLogo from "@/public/brand/glean-logo.png";

type BrandLogoProps = {
  width?: number;
  loading?: "eager" | "lazy";
};

/** The original transparent logo, including its built-in clear space. */
export default function BrandLogo({ width = 144, loading = "lazy" }: BrandLogoProps) {
  return (
    <Image
      src={gleanLogo}
      alt={BRAND}
      width={width}
      height={width / 3}
      loading={loading}
      className="block h-auto"
    />
  );
}
