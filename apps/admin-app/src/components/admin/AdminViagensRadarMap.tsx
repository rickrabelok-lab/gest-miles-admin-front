import { useMemo } from "react";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip } from "react-leaflet";
import L from "leaflet";
import MarkerClusterGroupModule from "react-leaflet-cluster";
import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/lib/assets/MarkerCluster.css";
import "react-leaflet-cluster/lib/assets/MarkerCluster.Default.css";

const MarkerClusterGroup =
  (MarkerClusterGroupModule as unknown as { default?: typeof MarkerClusterGroupModule }).default ?? MarkerClusterGroupModule;

export type MapRadarItem = {
  id: string;
  cliente_nome: string;
  origem_iata: string;
  destino_iata: string;
  data_ida: string;
  data_volta: string;
  passageiros: number;
  tipo_usuario: "clientes" | "clientes_gestao" | "outro";
  equipe_nome: string | null;
  origem: { lat: number; lng: number; label: string } | null;
  destino: { lat: number; lng: number; label: string } | null;
  status: "planejada" | "em_andamento" | "finalizada";
  viagemHoje: boolean;
  chegadaHoje: boolean;
  retornoHoje: boolean;
};

type Props = {
  viagens: MapRadarItem[];
};

function statusColor(status: MapRadarItem["status"]): string {
  if (status === "em_andamento") return "#7c3aed";
  if (status === "finalizada") return "#16a34a";
  return "#9ca3af";
}

function tipoUsuarioLabel(tipo: MapRadarItem["tipo_usuario"]): string {
  if (tipo === "clientes_gestao") return "Cliente de gestao";
  if (tipo === "clientes") return "Cliente comum";
  return "Outro";
}

function markerIcon(color: string): L.DivIcon {
  return L.divIcon({
    html: `<span style="display:block;width:12px;height:12px;border-radius:999px;background:${color};border:2px solid #fff;box-shadow:0 0 0 1px ${color};"></span>`,
    className: "",
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

export default function AdminViagensRadarMap({ viagens }: Props) {
  const points = useMemo(() => {
    return viagens
      .flatMap((v) => [v.origem, v.destino])
      .filter((p): p is { lat: number; lng: number; label: string } => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng));
  }, [viagens]);

  const center: [number, number] = useMemo(() => {
    if (!points.length) return [20, 0];
    const lat = points.reduce((acc, p) => acc + p.lat, 0) / points.length;
    const lng = points.reduce((acc, p) => acc + p.lng, 0) / points.length;
    return [lat, lng];
  }, [points]);

  return (
    <div className="h-[520px] overflow-hidden rounded-md border">
      <MapContainer center={center} zoom={2} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.esri.com/">Esri</a> & contributors'
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
        />

        {viagens.map((v) => {
          if (!v.origem || !v.destino) return null;
          const color = statusColor(v.status);
          return (
            <Polyline
              key={`line-${v.id}`}
              positions={[
                [v.origem.lat, v.origem.lng],
                [v.destino.lat, v.destino.lng],
              ]}
              pathOptions={{ color, weight: 3, opacity: 0.75 }}
            >
              <Tooltip>
                <div className="text-xs">
                  <div className="font-semibold">{v.cliente_nome}</div>
                  <div>
                    {v.origem_iata} -&gt; {v.destino_iata}
                  </div>
                  <div>
                    {v.data_ida} a {v.data_volta}
                  </div>
                  <div>{v.passageiros} passageiros</div>
                  <div>{tipoUsuarioLabel(v.tipo_usuario)}</div>
                  <div>Grupo: {v.equipe_nome ?? "Sem grupo"}</div>
                  {v.viagemHoje ? <div>Viagem hoje</div> : null}
                  {v.chegadaHoje ? <div>Chegada hoje</div> : null}
                  {v.retornoHoje ? <div>Retorno hoje</div> : null}
                </div>
              </Tooltip>
            </Polyline>
          );
        })}

        <MarkerClusterGroup chunkedLoading maxClusterRadius={50}>
          {viagens.map((v) => {
            if (!v.destino) return null;
            const color = statusColor(v.status);
            return (
              <Marker key={`dest-${v.id}`} position={[v.destino.lat, v.destino.lng]} icon={markerIcon(color)}>
                <Tooltip>
                  <div className="text-xs">
                    <div className="font-semibold">{v.destino.label}</div>
                    <div>
                      {v.cliente_nome}: {v.origem_iata} -&gt; {v.destino_iata}
                    </div>
                    <div>{tipoUsuarioLabel(v.tipo_usuario)} · {v.equipe_nome ?? "Sem grupo"}</div>
                    <div>
                      {v.data_ida} a {v.data_volta}
                    </div>
                  </div>
                </Tooltip>
              </Marker>
            );
          })}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  );
}
