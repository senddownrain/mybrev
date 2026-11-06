<template>
  <v-container class="admin-analytics">
    <header class="admin-analytics__header">
      <p class="admin-analytics__eyebrow">Адміністраванне</p>
      <h1>Аналітыка</h1>
      <p>
        Статыстыка выкарыстання малітоўніка і яго раздзелаў адкрываецца ў асобнай закрытай панэлі.
        Уваход у MyBrev не замяняе доступ Cloudflare Access: панэль праверае дазволеную пошту асобна.
      </p>
    </header>

    <v-btn
      v-if="reportsUrl"
      :href="reportsUrl"
      target="_blank"
      rel="noopener noreferrer"
      color="primary"
      size="large"
      class="text-none"
      prepend-icon="mdi-chart-box-outline"
      append-icon="mdi-open-in-new"
    >
      Адкрыць аналітыку
    </v-btn>
    <v-alert v-else type="info" variant="tonal" icon="mdi-link-off" class="admin-analytics__empty">
      Панэль аналітыкі яшчэ не падключана
    </v-alert>
  </v-container>
</template>

<script setup>
import { parseAnalyticsReportsUrl } from '@/utils/adminAccess';

const reportsUrl = parseAnalyticsReportsUrl(import.meta.env.VITE_ANALYTICS_REPORTS_URL);
</script>

<style scoped>
.admin-analytics {
  width: min(100%, 720px);
  padding: 42px 20px 80px !important;
}

.admin-analytics__header {
  margin-bottom: 28px;
}

.admin-analytics__eyebrow {
  margin: 0 0 8px;
  color: var(--nav-muted);
  font-size: 0.75rem;
  font-weight: 750;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}

.admin-analytics h1 {
  margin: 0 0 12px;
}

.admin-analytics__header p:last-child {
  margin: 0;
  color: var(--nav-muted);
}
</style>
