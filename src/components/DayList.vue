<template>
    <v-container fluid>


        <v-row dense>

            <v-col cols="12" sm="12" v-if="devMode">
                <v-card flat>
                    <v-card-actions>
                        <v-spacer></v-spacer>
                        <v-btn @click="showAdd()">Add</v-btn>
                    </v-card-actions>
                </v-card>
            </v-col>
            <v-col v-for="n in notes" :key="n" cols="12">
                <v-card :title="`Дзень ${n.id}`" @click="select(n)" :subtitle="strippedHtml(n.comment)" text="">
                </v-card>
            </v-col>
        </v-row>

        <v-dialog v-model="dialog" fullscreen :scrim="false" transition="dialog-bottom-transition">
            <v-card>
                <v-toolbar dark color="primary">
                    <v-btn icon dark @click="dialog = false">
                        <v-icon>mdi-close</v-icon>
                    </v-btn>
                    <v-toolbar-title>{{ current.title }}</v-toolbar-title>
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
                <v-card-text v-if="editMode">
                    <v-container>
                        <v-row>
                            <v-col cols="6" sm="3">
                                <v-text-field v-model="tmp.day" hint="Нумар дня" label="Нумар"></v-text-field>
                            </v-col>
                            <v-col cols="6" sm="3">
                                <v-text-field v-model="tmp.title" hint="Назва дня" label="Назва"></v-text-field>
                            </v-col>
                            <v-col cols="12" sm="6">
                                <v-text-field v-model="tmp.verse" hint="Вершы" label="Урывак, вершы"></v-text-field>
                            </v-col>
                            <v-col cols="12" sm="12">
                                <quill-editor theme="snow" toolbar="minimal" v-model:content="tmp.bible"
                                    placeholder="Тэкст бібліі" contentType="html" />
                            </v-col>
                            <v-col cols="12" sm="12" class="mt-10">
                                <quill-editor theme="snow" toolbar="minimal" v-model:content="tmp.comment"
                                    placeholder="Разважанні" contentType="html" />
                            </v-col>

                        </v-row>
                    </v-container>

                </v-card-text>
                <v-card-text v-if="!editMode">
                    <div class="text-h6 mb-3 mt-1">
                        Дзень {{ current.day }} - [{{ current.title }}]
                    </div>
                    <v-card class="mt-3" :title="current.verse">
                        <v-card-text>
                            <p v-html="current.bible"></p>
                        </v-card-text>
                    </v-card>
                    <v-card class="mt-3" title="РАЗВАЖАННІ">
                        <v-card-text>
                            <p v-html="current.comment"></p>
                        </v-card-text>
                    </v-card>
                </v-card-text>

            </v-card>
        </v-dialog>


        <v-dialog v-model="dialogAdd" fullscreen :scrim="false" transition="dialog-bottom-transition">
            <v-card>
                <v-toolbar dark color="primary">
                    <v-btn icon dark @click="dialogAdd = false">
                        <v-icon>mdi-close</v-icon>
                    </v-btn>
                    <v-toolbar-title>Add Day</v-toolbar-title>
                    <v-spacer></v-spacer>
                    <v-toolbar-items>

                        <v-btn variant="text" @click="add(addItem)">
                            Сохранить
                        </v-btn>
                        <v-btn variant="text" @click="dialogAdd = false">
                            Отменить
                        </v-btn>
                    </v-toolbar-items>
                </v-toolbar>
                <v-card-text>
                    <v-container>
                        <v-row>
                            <v-col cols="6" sm="3">
                                <v-text-field v-model="addItem.value.day" hint="Нумар дня" label="Нумар"></v-text-field>
                            </v-col>
                            <v-col cols="6" sm="3">
                                <v-text-field v-model="addItem.value.title" hint="Назва дня"
                                    label="Назва"></v-text-field>
                            </v-col>
                            <v-col cols="12" sm="6">
                                <v-text-field v-model="addItem.value.verse" hint="Вершы"
                                    label="Урывак, вершы"></v-text-field>
                            </v-col>
                            <v-col cols="12" sm="12">
                                <quill-editor theme="snow" toolbar="minimal" v-model:content="addItem.value.bible"
                                    placeholder="Тэкст бібліі" contentType="html" />
                            </v-col>
                            <v-col cols="12" sm="12" class="mt-10">
                                <quill-editor theme="snow" toolbar="minimal" v-model:content="addItem.value.comment"
                                    placeholder="Разважанні" contentType="html" />
                            </v-col>

                        </v-row>
                    </v-container>

                </v-card-text>


            </v-card>
        </v-dialog>

    </v-container>
</template>
  
<script setup>

import { ref } from 'vue'

import { useCollection, useFirestore } from 'vuefire'
import { collection, orderBy, query, doc, updateDoc, setDoc } from 'firebase/firestore'

const devMode = true

const db = useFirestore()
const notes = useCollection(query(collection(db, 'days'), orderBy('day')))

const dialogAdd = ref(false)
const addItem = ref({
    comment: "",
    bible: ""
})

const dialog = ref(false)
const current = ref({})
const tmp = ref({})
const editMode = ref(false)

function strippedHtml(value) {
    if (!value)
        return ""

    let regex = /(<([^>]+)>)/ig;
    return value.replace(regex, "");
}

function select(item) {
    current.value = item;
    dialog.value = true
}

function edit(item) {
    tmp.value = Object.assign({}, item);
    editMode.value = true
}

async function save(item) {

    editMode.value = false
    item.day = +tmp.value.day
    item.title = tmp.value.title
    item.verse = tmp.value.verse
    item.bible = tmp.value.bible
    item.comment = tmp.value.comment

    const noteRef = doc(db, "days", item.id);

    await updateDoc(noteRef, {
        day: +tmp.value.day,
        title: tmp.value.title,
        verse: tmp.value.verse,
        bible: tmp.value.bible,
        comment: tmp.value.comment,
    });

}


function showAdd() {
    addItem.value = ref({
        comment: "",
        bible: ""
    })
    dialogAdd.value = true
}

async function add(item) {

    dialogAdd.value = false
    console.log(item)
    await setDoc(doc(db, "days", item.value.day), {
        day: +item.value.day,
        title: item.value.title,
        verse: item.value.verse,
        bible: item.value.bible,
        comment: item.value.comment,
    });

    addItem.value = ref({
        comment: "",
        bible: ""
    })
}

</script>
  
  
<style>
.dialog-bottom-transition-enter-active,
.dialog-bottom-transition-leave-active {
    transition: transform .2s ease-in-out;
}

.v-card .v-card-text {
    line-height: 1.35rem !important;
}
</style>