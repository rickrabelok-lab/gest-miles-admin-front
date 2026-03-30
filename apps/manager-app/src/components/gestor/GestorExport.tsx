import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { GestorClienteResumo } from "@/hooks/useGestor";
import type { GestorVencimentoItem } from "@/hooks/useGestor";

type Props = {
  clients: GestorClienteResumo[];
  vencimentos: GestorVencimentoItem[];
  alertasCount: number;
  kpis: {
    totalClientesAtivos: number;
    valorEstrategicoTotal: number;
    economiaTotalGestao: number;
  };
};

const GestorExport = ({ clients, vencimentos, alertasCount, kpis }: Props) => {
  const [exportingPdf, setExportingPdf] = useState(false);

  const exportConsolidado = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (exportingPdf) return;
    setExportingPdf(true);
    try {
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF("p", "mm", "a4");
      const margin = 15;
      let y = 20;
      const lineHeight = 7;

      pdf.setFontSize(18);
      pdf.text("Relatório consolidado", margin, y);
      y += lineHeight * 2;

      pdf.setFontSize(10);
      pdf.setTextColor(100, 100, 100);
      pdf.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, margin, y);
      y += lineHeight;

      pdf.setTextColor(0, 0, 0);
      pdf.text(`Clientes ativos: ${kpis.totalClientesAtivos}`, margin, y);
      y += lineHeight;
      pdf.text(`Valor estratégico total: ${kpis.valorEstrategicoTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}`, margin, y);
      y += lineHeight;
      pdf.text(`Economia total gerada: ${kpis.economiaTotalGestao.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}`, margin, y);
      y += lineHeight * 2;

      pdf.setFontSize(12);
      pdf.text("Clientes", margin, y);
      y += lineHeight;

      const clientCols = [38, 32, 22, 30, 28, 12];
      pdf.setFontSize(7);
      pdf.setFont("helvetica", "bold");
      pdf.text("Cliente", margin, y);
      pdf.text("Gestores", margin + clientCols[0], y);
      pdf.text("Milhas", margin + clientCols[0] + clientCols[1], y);
      pdf.text("Valor est.", margin + clientCols[0] + clientCols[1] + clientCols[2], y);
      pdf.text("Economia", margin + clientCols[0] + clientCols[1] + clientCols[2] + clientCols[3], y);
      pdf.text("Scr.", margin + clientCols[0] + clientCols[1] + clientCols[2] + clientCols[3] + clientCols[4], y);
      y += lineHeight;
      pdf.setFont("helvetica", "normal");

      for (const c of clients) {
        if (y > 270) {
          pdf.addPage();
          y = 20;
        }
        const gestoresTxt =
          c.gestoresResponsaveis.length > 0
            ? c.gestoresResponsaveis.map((g) => g.nome).join(", ").slice(0, 42)
            : "—";
        pdf.text(c.nome.slice(0, 22), margin, y);
        pdf.text(gestoresTxt, margin + clientCols[0], y);
        pdf.text(c.milhas.toLocaleString("pt-BR"), margin + clientCols[0] + clientCols[1], y);
        pdf.text(c.valorEstimado.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }), margin + clientCols[0] + clientCols[1] + clientCols[2], y);
        pdf.text(c.economiaTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }), margin + clientCols[0] + clientCols[1] + clientCols[2] + clientCols[3], y);
        pdf.text(String(c.scoreEstrategico), margin + clientCols[0] + clientCols[1] + clientCols[2] + clientCols[3] + clientCols[4], y);
        y += lineHeight;
      }

      y += lineHeight;
      pdf.setFontSize(12);
      pdf.text("Próximos vencimentos (até 100)", margin, y);
      y += lineHeight;

      const vencCols = [40, 35, 20, 25, 20];
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "bold");
      pdf.text("Cliente", margin, y);
      pdf.text("Programa", margin + vencCols[0], y);
      pdf.text("Qtd", margin + vencCols[0] + vencCols[1], y);
      pdf.text("Data", margin + vencCols[0] + vencCols[1] + vencCols[2], y);
      pdf.text("Dias", margin + vencCols[0] + vencCols[1] + vencCols[2] + vencCols[3], y);
      y += lineHeight;
      pdf.setFont("helvetica", "normal");

      for (const v of vencimentos.slice(0, 100)) {
        if (y > 270) {
          pdf.addPage();
          y = 20;
        }
        pdf.text(v.clienteNome.slice(0, 18), margin, y);
        pdf.text(v.programName.slice(0, 15), margin + vencCols[0], y);
        pdf.text(v.quantidade.toLocaleString("pt-BR"), margin + vencCols[0] + vencCols[1], y);
        pdf.text(v.data, margin + vencCols[0] + vencCols[1] + vencCols[2], y);
        pdf.text(String(v.diasRestantes), margin + vencCols[0] + vencCols[1] + vencCols[2] + vencCols[3], y);
        y += lineHeight;
      }

      y += lineHeight;
      pdf.text(`Alertas pendentes: ${alertasCount}`, margin, y);

      const dataArquivo = new Date().toISOString().slice(0, 10);
      pdf.save(`relatorio-consolidado-${dataArquivo}.pdf`);
      toast.success("PDF baixado com sucesso.");
    } catch (err) {
      toast.error("Erro ao gerar PDF. Tente novamente.");
      console.error(err);
    } finally {
      setExportingPdf(false);
    }
  };

  const exportCsvRanking = () => {
    const headers = ["Cliente", "Milhas", "Valor estimado", "Economia total", "ROI médio", "Score", "Venc. 90d"];
    const rows = clients.map((c) => [
      c.nome,
      c.milhas,
      c.valorEstimado.toFixed(0),
      c.economiaTotal.toFixed(0),
      c.roiMedio.toFixed(0),
      c.scoreEstrategico,
      c.pontosVencendo90d,
    ]);
    const csv = [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ranking-clientes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-muted-foreground">
        Exportação profissional
      </p>
      <Card className="rounded-xl border-border/80">
        <CardContent className="p-3 space-y-2">
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={exportConsolidado}
            disabled={exportingPdf}
          >
            {exportingPdf ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            {exportingPdf ? "Gerando PDF..." : "Relatório consolidado (PDF)"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={exportCsvRanking}
          >
            <Download className="h-4 w-4" />
            Ranking de clientes (CSV)
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default GestorExport;
