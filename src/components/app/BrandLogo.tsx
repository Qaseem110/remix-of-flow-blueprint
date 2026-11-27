import logo from "@/assets/hs/logo.png";

export function BrandLogo({ className = "h-9" }: { className?: string }) {
  return <img src={logo} alt="HealthSahoolat" width={163} height={36} className={`${className} w-auto shrink-0`} />;
}
