<template>
  <v-container>
    <h1 class="text-h4 font-weight-light mb-4">Панэль адміністратара</h1>
    <p class="mb-6">Сардэчна запрашаем! Выберыце раздзел для кіравання.</p>

    <v-row>
      
      <v-col cols="12" md="6">
        <v-card to="/admin/year-options" hover><v-card-title>Налады года (YearOptions)</v-card-title><v-card-subtitle>Кіраванне рухомымі святамі і перыядамі</v-card-subtitle></v-card>
      </v-col>
      <v-col cols="12" md="6">
        <v-card to="/admin/logic-tester" hover color="blue-grey-darken-3">
          <v-card-title>Тэстар літургічнай логікі</v-card-title>
          <v-card-subtitle>Праверка разлікаў для любой даты</v-card-subtitle>
        </v-card>
      </v-col>

      <!-- Временные/технические разделы -->
      <v-col cols="12">
        <v-divider class="my-4"></v-divider>
        <h2 class="text-h6 font-weight-light mb-3">Тэхнічныя раздзелы</h2>
      </v-col>
      <v-col cols="12" md="4"><v-card to="/admin/db-day-list" hover><v-card-title>DbDayList</v-card-title></v-card></v-col>
      <v-col cols="12" md="4"><v-card to="/admin/backup" hover><v-card-title>Backup</v-card-title></v-card></v-col>
      <v-col cols="12" md="4"><v-card :to="{ name: 'AdminCategories' }" hover><v-card-title>Катэгорыі малітваў</v-card-title><v-card-subtitle>Кіраванне катэгорыямі ў меню</v-card-subtitle></v-card></v-col>
    
    </v-row>
  </v-container>
</template>