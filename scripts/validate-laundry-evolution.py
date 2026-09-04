#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENTITIES = ROOT / "base44" / "entities"
FUNCTIONS = ROOT / "base44" / "functions"

NEW_ENTITIES = {
    "AIJob", "AccountsPayable", "AccountsReceivable", "BankTransaction", "CashMovement", "CashSession",
    "ConsumptionRecipe", "DocumentAsset", "FinancialDocument", "GarmentEvent", "GarmentItem", "HumanReview",
    "IntegrationConfiguration", "InventoryCount", "LaundryService", "Location", "PaymentAllocation", "PriceRule",
    "ProcessedEvent", "ProductionBatch", "PurchaseDocument", "PurchaseItem", "QualityInspection", "ReworkCase",
    "StockItem", "StockMovement", "Supplier", "ThirdPartyJob", "ThirdPartyPartner", "DeliveryReceipt",
}

NEW_FUNCTIONS = {
    "analyze_garment_images", "approve_financial_document", "approve_purchase_document", "approve_quote",
    "cancel_management_record", "extract_financial_document", "extract_purchase_document", "inspect_garment_quality",
    "integration_status", "manage_accounts_payable", "manage_cash_session", "manage_third_party_job",
    "reconcile_payment", "record_counter_payment", "resolve_human_review", "update_garment_status",
    "price_garment_services", "register_label_print", "move_garments", "manage_location", "complete_garment_delivery",
}


def fail(message: str, failures: list[str]) -> None:
    failures.append(message)


def load_json(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    text = re.sub(r"(^|\s)//.*", r"\1", text)
    text = re.sub(r",\s*([}\]])", r"\1", text)
    return json.loads(text)


def main() -> int:
    failures: list[str] = []
    entity_names: dict[str, Path] = {}

    for path in sorted(ENTITIES.glob("*.jsonc")):
        try:
            schema = load_json(path)
        except Exception as error:
            fail(f"Schema inválido {path.relative_to(ROOT)}: {error}", failures)
            continue

        name = schema.get("name")
        properties = schema.get("properties", {})
        if not name or schema.get("type") != "object" or not isinstance(properties, dict):
            fail(f"Schema incompleto {path.relative_to(ROOT)}", failures)
            continue
        if name in entity_names:
            fail(f"Entidade duplicada {name}: {entity_names[name]} e {path}", failures)
        entity_names[name] = path
        for required in schema.get("required", []):
            if required not in properties:
                fail(f"Campo obrigatório inexistente em {name}: {required}", failures)

    missing_entities = sorted(NEW_ENTITIES - set(entity_names))
    if missing_entities:
        fail(f"Entidades ausentes: {', '.join(missing_entities)}", failures)

    for function_name in sorted(NEW_FUNCTIONS):
        entry = FUNCTIONS / function_name / "entry.ts"
        if not entry.exists() or not entry.read_text(encoding="utf-8").strip():
            fail(f"Função ausente: {function_name}", failures)
            continue
        source = entry.read_text(encoding="utf-8")
        if "base44.auth.me()" not in source:
            fail(f"Função sem autenticação explícita: {function_name}", failures)
        if "requestId" not in source:
            fail(f"Função sem request_id: {function_name}", failures)

    env_example = ROOT / ".env.example"
    if not env_example.exists():
        fail(".env.example ausente", failures)
    else:
        for line_number, raw_line in enumerate(env_example.read_text(encoding="utf-8").splitlines(), 1):
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            if value and value not in {"false", "true"}:
                fail(f"Valor potencialmente sensível em .env.example:{line_number} ({key})", failures)

    orchestrator = (FUNCTIONS / "orchestrator" / "entry.ts").read_text(encoding="utf-8")
    if "receipt_processed_auto" in orchestrator:
        fail("Orquestrador ainda confirma comprovante automaticamente", failures)
    if re.search(r"status:\s*['\"]succeeded['\"]", orchestrator):
        fail("Orquestrador ainda cria pagamento succeeded por imagem", failures)

    vision = (FUNCTIONS / "openai_vision" / "entry.ts").read_text(encoding="utf-8")
    if "mock: true" in vision:
        fail("Visão ainda retorna sucesso simulado sem token", failures)
    if "estimated_price" in vision and "matchedProduct" not in vision:
        fail("Preço da visão não está vinculado ao catálogo", failures)

    recurring = (FUNCTIONS / "generateRecurringExpenses" / "entry.ts").read_text(encoding="utf-8")
    if "FinanceEntry.create" in recurring or "status: 'paid'" in recurring:
        fail("Despesa recorrente ainda nasce como paga", failures)

    manual_quote = (ROOT / "src" / "components" / "crm" / "AdvancedQuoteModal.jsx").read_text(encoding="utf-8")
    if "entities.Payment.create" in manual_quote:
        fail("Orçamento manual ainda cria pagamento diretamente no navegador", failures)
    if "record_counter_payment" not in manual_quote:
        fail("Orçamento manual não usa a função segura de pagamento", failures)
    for marker in ["garmentItems.map", "condition_checked", "customer_authorized_risks", "qty: 1", "price_garment_services", "services={laundryServices}"]:
        if marker not in manual_quote:
            fail(f"Orçamento manual sem persistência individual obrigatória: {marker}", failures)

    approve_quote = (FUNCTIONS / "approve_quote" / "entry.ts").read_text(encoding="utf-8")
    for marker in ["priceGarmentItems", "condition_checked: item.condition_checked === true", "customer_authorized_risks: item.customer_authorized_risks === true", "services: item.services || []"]:
        if marker not in approve_quote:
            fail(f"Aprovação não preserva a conferência manual: {marker}", failures)

    pricing = (ROOT / "base44" / "shared" / "laundryPricing.js").read_text(encoding="utf-8")
    for marker in ["service_not_compatible", "legacy_product_price", "price_rule_id", "customerGroup"]:
        if marker not in pricing:
            fail(f"Precificação de serviços sem marcador obrigatório: {marker}", failures)

    command_center = (ROOT / "src" / "components" / "management" / "ManagementCommandCenter.jsx").read_text(encoding="utf-8")
    for marker in ["GarmentLocationPanel", "GarmentLabelPrintDialog", "GarmentDeliveryDialog", "command-locations", "command-orders"]:
        if marker not in command_center:
            fail(f"Centro de comando sem jornada operacional: {marker}", failures)

    move_garments = (FUNCTIONS / "move_garments" / "entry.ts").read_text(encoding="utf-8")
    for marker in ["location_capacity_exceeded", "ProcessedEvent", "location_changed", "refreshOccupancy"]:
        if marker not in move_garments:
            fail(f"Movimentação sem garantia obrigatória: {marker}", failures)

    delivery = (FUNCTIONS / "complete_garment_delivery" / "entry.ts").read_text(encoding="utf-8")
    for marker in ["outstanding_balance", "single_customer_and_unit_required", "delivery_scope", "DeliveryReceipt", "partially_delivered"]:
        if marker not in delivery:
            fail(f"Entrega parcial sem garantia obrigatória: {marker}", failures)

    label_print = (FUNCTIONS / "register_label_print" / "entry.ts").read_text(encoding="utf-8")
    for marker in ["reprint_reason_required", "label_print_count", "AuditLog"]:
        if marker not in label_print:
            fail(f"Impressão de etiqueta sem garantia obrigatória: {marker}", failures)

    secure_files = (ROOT / "src" / "lib" / "secureFiles.js").read_text(encoding="utf-8")
    for marker in ["sha256Hex", "validateFile", "DUPLICATE_DOCUMENT"]:
        if marker not in secure_files:
            fail(f"Upload seguro sem marcador obrigatório: {marker}", failures)

    if failures:
        print("VALIDAÇÃO FALHOU")
        for item in failures:
            print(f"- {item}")
        return 1

    print(f"VALIDAÇÃO OK: {len(entity_names)} schemas, {len(NEW_FUNCTIONS)} novas funções e invariantes críticos verificados.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
