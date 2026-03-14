---
name: WhatsApp
description: Interação com o WhatsApp para leitura de mensagens e resposta direta.
---

# Skill: WhatsApp

Esta skill permite que você interaja com o WhatsApp diretamente. Você pode realizar o login através de um QR Code, verificar o status da conexão e enviar mensagens para contatos ou números específicos.

## Funcionalidades principais

### 1. Login e Conexão
Para começar a usar o WhatsApp, você deve primeiro inicializar a conexão.
- **Ação:** `whatsapp_tool` com `action: "login"`.
- **Nota:** Se for a primeira vez, um código QR será gerado nos logs do servidor. Você precisará escaneá-lo com seu telefone.

### 2. Enviar Mensagens
Você pode enviar mensagens de texto para qualquer contato.
- **Ação:** `whatsapp_tool` com `action: "send_message"`.
- **Parâmetros:**
  - `jid`: O número do destinatário com DDI (ex: `5511999999999`).
  - `text`: O conteúdo da mensagem.

### 3. Verificar Status
Verifica se o WhatsApp está conectado e pronto para uso.
- **Ação:** `whatsapp_tool` com `action: "status"`.

## Diretrizes de Uso
- Sempre inclua o código do país (DDI) ao enviar mensagens para números de telefone.
- O ClawCore não armazena o conteúdo das suas conversas, apenas atua como uma interface para envio e leitura em tempo real quando solicitado.
