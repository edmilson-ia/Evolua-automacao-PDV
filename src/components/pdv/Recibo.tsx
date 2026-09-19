import { brl, dataHoraBR } from "@/lib/format";
import { formatarTelefone } from "@/lib/telefone";
import { FORMA_LABEL, type Venda } from "@/types/venda";

// Comprovante interno, NÃO fiscal.
export default function Recibo({
  venda,
  nomeFantasia = "Evolua Automação",
  largura = 80,
}: {
  venda: Venda;
  nomeFantasia?: string;
  /** Largura do papel da impressora térmica, em mm. */
  largura?: 58 | 80;
}) {
  const subtotal = venda.itens_venda.reduce((s, i) => s + Number(i.subtotal), 0);
  return (
    <div className="recibo font-mono" style={{ width: `${largura}mm`, fontSize: largura === 58 ? 11 : 13, padding: "2mm" }}>
      {/* Papel de cupom: sem margem de página e do tamanho da bobina (vale só ao imprimir) */}
      <style>{`@media print { @page { size: ${largura}mm auto; margin: 0 } }`}</style>
      <div className="text-center font-bold">{nomeFantasia}</div>
      <div className="text-center text-xs">Comprovante não fiscal</div>
      <div className="text-center text-xs">{dataHoraBR(venda.criado_em)}</div>
      {venda.operador_nome && <div className="text-center text-xs">Operador: {venda.operador_nome}</div>}
      {venda.cliente_nome && <div className="text-center text-xs">Cliente: {venda.cliente_nome}</div>}
      <hr className="border-dashed my-2" />
      {venda.itens_venda.map((i) => (
        <div key={i.id} className="flex justify-between gap-2">
          <span className="min-w-0 break-words">
            {Number(i.quantidade)}x {i.produtos?.nome ?? "Produto"}
          </span>
          <span className="shrink-0">{brl(Number(i.subtotal))}</span>
        </div>
      ))}
      <hr className="border-dashed my-2" />
      {Number(venda.desconto) > 0 && (
        <>
          <div className="flex justify-between"><span>Subtotal</span><span>{brl(subtotal)}</span></div>
          <div className="flex justify-between"><span>Desconto</span><span>-{brl(Number(venda.desconto))}</span></div>
        </>
      )}
      <div className="flex justify-between font-bold"><span>TOTAL</span><span>{brl(Number(venda.total))}</span></div>
      <div className="flex justify-between"><span>Pagamento</span><span>{FORMA_LABEL[venda.forma_pagamento]}</span></div>
      {venda.valor_recebido != null && (
        <>
          <div className="flex justify-between"><span>Recebido</span><span>{brl(Number(venda.valor_recebido))}</span></div>
          <div className="flex justify-between"><span>Troco</span><span>{brl(Number(venda.troco ?? 0))}</span></div>
        </>
      )}
      {venda.entrega && (
        <>
          <hr className="border-dashed my-2" />
          <div className="font-bold">ENTREGA</div>
          <div>{venda.cliente_nome}</div>
          {venda.cliente_telefone && <div>{formatarTelefone(venda.cliente_telefone)}</div>}
          <div className="break-words">{venda.entrega_endereco}</div>
        </>
      )}
      <div className="text-center text-xs mt-3">Obrigado pela preferência!</div>
    </div>
  );
}
