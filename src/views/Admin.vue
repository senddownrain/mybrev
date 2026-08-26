<template>
  <v-container class="admin-home">
    <section class="admin-home__hero">
      <p class="admin-home__eyebrow">Адміністраванне</p>
      <h1>Панэль адміністратара</h1>
      <p class="admin-home__description">
        Выберыце раздзел, які хочаце наладзіць.
      </p>
    </section>

    <v-card class="admin-home__card" elevation="0">
      <div class="admin-home__icon">
        <v-icon icon="mdi-calendar-cog-outline" size="28" />
      </div>
      <div class="admin-home__content">
        <h2>Налады года</h2>
        <p>Разлічвайце і захоўвайце даты рухомых святаў для літургічных гадоў.</p>
      </div>
      <v-btn
        :to="{ name: 'AdminYearOptions' }"
        color="primary"
        rounded="pill"
        class="text-none"
        append-icon="mdi-arrow-right"
      >
        Адкрыць
      </v-btn>
    </v-card>
  </v-container>
</template>

<style scoped>
.admin-home {
  width: min(100%, 1180px);
  padding: 42px 20px 80px !important;
  color: var(--nav-on-surface);
}

.admin-home__hero {
  margin: 0 6px 30px;
}

.admin-home__eyebrow {
  margin: 0 0 8px;
  color: var(--nav-muted);
  font-size: 0.75rem;
  font-weight: 750;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}

.admin-home h1,
.admin-home h2,
.admin-home p {
  margin-top: 0;
}

.admin-home h1 {
  margin-bottom: 8px;
  font-size: clamp(1.8rem, 4vw, 2.5rem);
  line-height: 1.1;
}

.admin-home__description,
.admin-home__content p {
  color: var(--nav-muted);
}

.admin-home__description {
  margin-bottom: 0;
}

.admin-home__card {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 22px;
  border: 1px solid var(--nav-border);
  border-radius: 20px;
  background: var(--nav-surface);
}

.admin-home__icon {
  display: grid;
  flex: 0 0 auto;
  width: 52px;
  height: 52px;
  place-items: center;
  border-radius: 16px;
  color: rgb(var(--v-theme-primary));
  background: color-mix(in srgb, rgb(var(--v-theme-primary)) 13%, transparent);
}

.admin-home__content {
  flex: 1;
}

.admin-home__content h2 {
  margin-bottom: 5px;
  font-size: 1.1rem;
}

.admin-home__content p {
  margin-bottom: 0;
}

@media (max-width: 600px) {
  .admin-home__card {
    flex-wrap: wrap;
  }

  .admin-home__card .v-btn {
    width: 100%;
  }
}
</style>
