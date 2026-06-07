import { Button, Iframe } from "@tiendanube/nube-sdk-jsx";
import type { NubeSDK } from "@tiendanube/nube-sdk-types";
import { styled } from "@tiendanube/nube-sdk-ui";

const APP_BASE = "https://asesora-moda-backend-production.up.railway.app";

const TriggerButton = styled(Button)`
  background-color: #1a1a2e;
  color: #ffffff;
  border-radius: 50px;
  min-height: 48px;
  padding: 0.85rem 1.3rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
  margin-right: 16px;
  margin-bottom: 16px;
  font-weight: 500;
`;

function buildPopupUrl(storeId: number | string) {
  const params = new URLSearchParams({
    embed: "1",
    api: APP_BASE,
    store: String(storeId),
  });
  return `${APP_BASE}/widget/popup.html?${params.toString()}`;
}

function closeModal(nube: NubeSDK) {
  nube.clearSlot("modal_content");
}

function openModal(nube: NubeSDK, storeId: number) {
  nube.render(
    "modal_content",
    <Iframe
      src={buildPopupUrl(storeId)}
      width="100%"
      height="92vh"
      style={{
        border: "none",
        borderRadius: "20px 20px 0 0",
        background: "#FAF9F6",
      }}
      onMessage={(event) => {
        const data = event.value as { type?: string } | null;
        if (data?.type === "asesora-close") {
          closeModal(nube);
        }
      }}
    />,
  );
}

export function App(nube: NubeSDK) {
  const storeId = nube.getState().store?.id;

  if (!storeId) {
    console.warn("[asesora-moda] NubeSDK: store.id no disponible en el state");
    return;
  }

  nube.render(
    "corner_bottom_right",
    <TriggerButton
      variant="primary"
      onClick={() => openModal(nube, storeId)}
    >
      👗 ¿Qué me queda bien?
    </TriggerButton>,
  );
}
