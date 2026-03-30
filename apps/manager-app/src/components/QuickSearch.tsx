import { Plane, Plus } from "lucide-react";

const QuickSearch = () => {
  return (
    <div className="px-5 py-3">
      <div className="grid grid-cols-5 gap-3">
        {/* Saved route */}
        <div className="col-span-3 flex flex-col gap-1 rounded-2xl bg-card p-4 card-miles">
          <div className="flex items-center gap-2 text-foreground">
            <span className="font-display text-lg font-bold">VIX</span>
            <Plane size={18} className="text-primary" />
            <span className="font-display text-lg font-bold">RIO</span>
          </div>
          <p className="text-xs text-muted-foreground">01 jun (seg) - 01 jun (seg)</p>
          <p className="text-xs text-muted-foreground">1 adulto</p>
        </div>

        {/* New search */}
        <button className="col-span-2 flex flex-col items-center justify-center gap-2 rounded-2xl bg-card card-miles hover:bg-secondary transition-colors">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
            <Plus size={20} className="text-foreground" />
          </div>
          <span className="text-sm font-semibold text-foreground">Nova Busca</span>
        </button>
      </div>
    </div>
  );
};

export default QuickSearch;
