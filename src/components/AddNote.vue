<template>
      <v-dialog v-model="show" fullscreen :scrim="false" transition="dialog-bottom-transition">
        <v-card>
          <v-toolbar dark color="primary">
            <v-btn icon dark @click="dialog = false">
              <v-icon>mdi-close</v-icon>
            </v-btn>
            <v-toolbar-title> Add note</v-toolbar-title>
            <v-spacer></v-spacer>
            <v-toolbar-items>
              <v-btn v-if="!editMode" variant="text" @click="edit(current)">
                Изменить
              </v-btn>
  
              <v-btn v-if="editMode" variant="text" @click="save(current)">
                Сохранить
              </v-btn>
              <v-btn v-if="editMode" variant="text" @click="editMode = false">
                Отменить
              </v-btn>
            </v-toolbar-items>
          </v-toolbar>
          <v-card-text>
            <quill-editor v-if="editMode" theme="snow" toolbar="minimal" v-model:content="tmp.text" contentType="html" />
  
            <p v-if="!editMode" v-html="current.text">
  
            </p>
  
          </v-card-text>
  
        </v-card>
      </v-dialog>
  </template>
  
  <script setup>
  
  
  import { ref } from 'vue'
  
  import { useCollection, useFirestore } from 'vuefire'
  import { collection, orderBy, query, doc, setDoc } from 'firebase/firestore'

  defineProps({
  show: Boolean,
})

  const db = useFirestore()
  const dialog = ref(false)
  const current = ref({})
  const tmp = ref({})
  const editMode = ref(false)
  const fab = ref(false);
  const regex = /(<([^>]+)>)/ig;
  const devMode = true
  
  function strippedHtml(value) {
    let regex = /(<([^>]+)>)/ig;
    return value.replace(regex, "");
  }
  
  function select(item) {
    this.current = item;
    dialog.value = true
  }
  
  function edit(item) {
    this.tmp = Object.assign({}, item);
    this.editMode = true
  }
  
  async function save(item) {
    this.editMode = false
    item.text = this.tmp.text
    const noteRef = doc(db, "notes", item.id);
  
    await updateDoc(noteRef, {
      text: this.tmp.text
    });
  
  }
  
  </script>
  
  
  <style>
  .dialog-bottom-transition-enter-active,
  .dialog-bottom-transition-leave-active {
    transition: transform .2s ease-in-out;
  }
  </style>