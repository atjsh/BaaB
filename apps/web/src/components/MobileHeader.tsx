interface MobileHeaderProps {
  onOpenSidebar: () => void;
  title: string;
}

export function MobileHeader({ onOpenSidebar, title }: MobileHeaderProps) {
  return (
    <div className="md:hidden border-b p-3 bg-white flex items-center gap-3">
      <button onClick={onOpenSidebar} className="p-1 text-gray-600 hover:text-gray-800">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <span className="font-semibold">{title}</span>
    </div>
  );
}
