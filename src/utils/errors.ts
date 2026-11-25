export function getFriendlyErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = String((err as { code: unknown }).code);
    switch (code) {
      case 'auth/popup-closed-by-user':
        return 'O login com Google foi cancelado antes de concluir.';
      case 'auth/cancelled-popup-request':
        return 'Outra janela de login já estava aberta. Tente novamente.';
      case 'auth/popup-blocked':
        return 'O navegador bloqueou a janela de login. Permita popups para continuar.';
      case 'auth/operation-not-supported-in-this-environment':
      case 'auth/web-storage-unsupported':
        return 'O navegador bloqueou o armazenamento da sessão. Se você abriu o app dentro de outro aplicativo, abra o endereço diretamente no navegador e tente de novo.';
      case 'auth/operation-not-allowed':
        return 'Método de login não habilitado no Firebase Auth.';
      case 'auth/unauthorized-domain': {
        const hostname = typeof window !== 'undefined' ? window.location.hostname : 'desconhecido';
        return `Domínio não autorizado no Firebase Auth: ${hostname}. Adicione este domínio em Authentication > Settings > Authorized domains.`;
      }
      case 'auth/too-many-requests':
        return 'Muitas tentativas seguidas. Aguarde alguns instantes.';
      case 'permission-denied':
        return 'Permissão negada no banco de dados. Verifique se você está autenticado.';
      default:
        break;
    }
  }
  if (err instanceof Error && err.message) {
    if (err.message.includes('Missing or insufficient permissions')) {
      return 'Permissão insuficiente no Firestore. Recarregue ou faça login novamente.';
    }
    return err.message;
  }
  return 'Ocorreu um erro inesperado. Tente novamente.';
}
