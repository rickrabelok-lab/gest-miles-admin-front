import { Ticket, Layers, Users } from "lucide-react";

interface BottomNavProps {
  activeItem: string;
  onItemChange: (item: string) => void;
  showClientSelector?: boolean;
  clients?: Array<{ id: string; name: string }>;
  selectedClientId?: string | null;
  onClientSelect?: (clientId: string) => void;
  onBackToMyAccount?: () => void;
  onRemoveClient?: (clientId: string) => void;
}

const items = [
  { id: "passagens", label: "Passagens", icon: Ticket },
  { id: "programas", label: "Programas", icon: Layers },
  { id: "vender", label: "Clientes", icon: Users },
];

const BottomNav = ({
  activeItem,
  onItemChange,
  showClientSelector = false,
  clients = [],
  selectedClientId,
  onClientSelect,
  onBackToMyAccount,
  onRemoveClient,
}: BottomNavProps) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 gradient-primary shadow-[0_-2px_16px_rgba(0,0,0,0.08)]">
      <div className="mx-auto flex max-w-md items-center justify-around py-2.5">
        {items.map((item) => {
          const isActive = activeItem === item.id;
          const Icon = item.icon;
          return (
            <div key={item.id} className="relative">
              <button
                onClick={() => onItemChange(item.id)}
                className={`flex flex-col items-center gap-1 px-5 py-2 transition-all duration-300 ease-out ${
                  isActive ? "text-primary-foreground" : "text-white/70 hover:text-white/90"
                }`}
              >
                <div className="relative">
                  <Icon size={24} strokeWidth={isActive ? 2.5 : 1.8} />
                  {isActive && (
                    <div className="absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-white" />
                  )}
                </div>
                <span
                  className={`text-xs ${
                    isActive ? "font-semibold text-primary-foreground" : "font-medium"
                  }`}
                >
                  {item.label}
                </span>
              </button>
            </div>
          );
        })}
      </div>
      {/* Safe area for iPhones */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </div>
  );
};

export default BottomNav;
