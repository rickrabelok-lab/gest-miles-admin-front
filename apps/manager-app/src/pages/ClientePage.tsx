import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Search, UserMinus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useGestor } from "@/hooks/useGestor";
import { useVincularCliente } from "@/hooks/useVincularCliente";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import BottomNav from "@/components/BottomNav";
import { toast } from "sonner";

const MANAGER_ACCESSED_CLIENTS_PREFIX = "mile-manager:manager-accessed-clients:";

const ClientePage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const selectedClientId = searchParams.get("clientId");
  const { user, role } = useAuth();
  const managerMode = role === "gestor" || role === "admin";
  const [pastedId, setPastedId] = useState("");
  const [searchByName, setSearchByName] = useState("");

  const { resumoClientes } = useGestor(
    managerMode,
    useMemo(() => (user?.id ? [user.id] : []), [user?.id]),
  );

  const gestorClientOptions = useMemo(
    () =>
      resumoClientes.map((c) => ({
        id: c.clienteId,
        name: c.nome,
      })),
    [resumoClientes],
  );

  const clients = useMemo(() => {
    if (!user?.id || typeof window === "undefined") return gestorClientOptions;
    const key = `${MANAGER_ACCESSED_CLIENTS_PREFIX}${user.id}`;
    const raw = window.localStorage.getItem(key);
    let accessed: Array<{ id: string; name?: string }> = [];
    if (raw) {
      try {
        accessed = JSON.parse(raw);
        if (!Array.isArray(accessed)) accessed = [];
      } catch {
        accessed = [];
      }
    }
    const fromApiIds = new Set(gestorClientOptions.map((c) => c.id));
    const onlyAccessed = accessed.filter((a) => !fromApiIds.has(a.id));
    return [
      ...gestorClientOptions,
      ...onlyAccessed.map((a) => ({
        id: a.id,
        name: a.name ?? `Cliente ${a.id.slice(0, 8)}`,
      })),
    ];
  }, [user?.id, gestorClientOptions]);

  const filteredClients = useMemo(() => {
    const q = searchByName.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) =>
      (c.name ?? "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").includes(
        q.normalize("NFD").replace(/\p{Diacritic}/gu, ""),
      ),
    );
  }, [clients, searchByName]);

  const { vincular, desvincular, isVincularLoading, isDesvincularLoading, getErrorMessage } =
    useVincularCliente(managerMode ? user?.id : undefined);

  const handleAccessById = async () => {
    const id = pastedId.trim();
    if (!id) return;
    try {
      await vincular(id);
      setPastedId("");
      toast.success("Cliente vinculado.");
      const query = new URLSearchParams(searchParams);
      query.set("clientId", id);
      navigate(`/?${query.toString()}`);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleSelectClient = (clientId: string) => {
    if (user?.id && typeof window !== "undefined") {
      const key = `${MANAGER_ACCESSED_CLIENTS_PREFIX}${user.id}`;
      const raw = window.localStorage.getItem(key);
      let list: Array<{ id: string; name?: string }> = [];
      if (raw) {
        try {
          list = JSON.parse(raw);
          if (!Array.isArray(list)) list = [];
        } catch {
          list = [];
        }
      }
      const name = clients.find((c) => c.id === clientId)?.name;
      if (!list.some((c) => c.id === clientId)) {
        list.push({ id: clientId, name });
        window.localStorage.setItem(key, JSON.stringify(list));
      }
    }
    const query = new URLSearchParams();
    query.set("clientId", clientId);
    navigate(`/?${query.toString()}`);
  };

  const handleBackToMyAccount = () => {
    navigate("/");
  };

  const handleRemoveClient = async () => {
    if (!selectedClientId) return;
    try {
      await desvincular(selectedClientId);
      toast.success("Cliente desvinculado.");
      navigate("/");
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-md bg-background pb-24">
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="-ml-1 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
          >
            <ArrowLeft size={20} strokeWidth={1.5} />
          </button>
          <h1 className="text-base font-semibold tracking-tight">Clientes sob Gestão</h1>
          <div className="w-9" />
        </div>
      </header>

      <main className="px-4 py-6">
        <div className="space-y-6">
          <section>
            <Button
              variant="outline"
              className="w-full justify-start gap-2 border-slate-200"
              onClick={handleBackToMyAccount}
            >
              <ArrowLeft size={16} />
              Voltar para minha conta
            </Button>
          </section>

          {selectedClientId && (
            <section>
              <Button
                variant="outline"
                className="w-full justify-start gap-2 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/50"
                onClick={handleRemoveClient}
                disabled={isDesvincularLoading}
              >
                <UserMinus size={16} />
                Remover cliente da carteira
              </Button>
            </section>
          )}

          <section>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Acessar por ID
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="Cole o ID da conta do cliente"
                value={pastedId}
                onChange={(e) => setPastedId(e.target.value)}
                className="h-10 flex-1 font-mono text-sm"
              />
              <Button
                size="sm"
                className="h-10 shrink-0"
                onClick={handleAccessById}
                disabled={!pastedId.trim() || isVincularLoading}
              >
                {isVincularLoading ? "..." : "Acessar"}
              </Button>
            </div>
          </section>

          <section>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Clientes na sua carteira
            </p>
            {clients.length > 0 && (
              <div className="mb-3">
                <div className="relative">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    placeholder="Pesquisar pelo nome"
                    value={searchByName}
                    onChange={(e) => setSearchByName(e.target.value)}
                    className="h-10 pl-9 pr-3"
                  />
                </div>
              </div>
            )}
            {clients.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border bg-muted/30 py-8 text-center text-sm text-muted-foreground">
                Nenhum cliente vinculado. Use o campo acima para acessar por ID.
              </p>
            ) : filteredClients.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border bg-muted/30 py-6 text-center text-sm text-muted-foreground">
                Nenhum cliente encontrado para &quot;{searchByName.trim()}&quot;.
              </p>
            ) : (
              <ul className="space-y-1 rounded-xl border border-border bg-card overflow-hidden">
                {filteredClients.map((client) => {
                  const isSelected = selectedClientId === client.id;
                  return (
                    <li key={client.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectClient(client.id)}
                        className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm transition-colors ${
                          isSelected
                            ? "bg-primary/10 font-semibold text-primary"
                            : "text-foreground hover:bg-muted/50"
                        }`}
                      >
                        <span className="truncate">{client.name}</span>
                        {isSelected && <span className="text-primary">✓</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </main>

      <BottomNav
        activeItem="vender"
        onItemChange={(item) => {
          if (item === "passagens") navigate("/search-flights");
          else if (item === "programas") navigate("/");
          else if (item === "vender") return;
        }}
        showClientSelector={false}
        clients={[]}
      />
    </div>
  );
};

export default ClientePage;
