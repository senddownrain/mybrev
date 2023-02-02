<template>
    <v-container fluid>


        <v-row dense>
        
      <v-col cols="12" sm="12" v-if="devMode">
        <v-card flat>
          <v-card-actions >
            <v-spacer></v-spacer>
            <v-btn @click="showAdd()">Add</v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
            <v-col v-for="n in notes" :key="n" cols="12">
                <v-card :title="`Тыдзень ${n.id}`" @click="select(n)" :subtitle="strippedHtml(n.comment)" text="">
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
                                <v-text-field v-model="tmp.week" hint="Нумар тыдня" label="Нумар"></v-text-field>
                            </v-col>
                            <v-col cols="6" sm="3">
                                <v-text-field v-model="tmp.title" hint="Назва дня" label="Назва"></v-text-field>
                            </v-col>
                            <v-col cols="12" sm="12">
                                <quill-editor theme="snow" toolbar="minimal" v-model:content="tmp.comment"
                                    placeholder="Тэкст каментарыя" contentType="html" />
                            </v-col>
                            <v-col cols="12" sm="12" class="mt-10">
                                <quill-editor theme="snow" toolbar="minimal" v-model:content="tmp.tasks"
                                    placeholder="Заданні на тыдзень" contentType="html" />
                            </v-col>
                            <v-col cols="12" sm="12" class="mt-10">
                                <quill-editor theme="snow" toolbar="minimal" v-model:content="tmp.shotcomment"
                                    placeholder="Кароткі тэкст каментарыя" contentType="html" />
                            </v-col>
                            <v-col cols="12" sm="12" class="mt-10 mb-10">
                                <quill-editor theme="snow" toolbar="minimal" v-model:content="tmp.shottasks"
                                    placeholder="Заданні на тыдзень коратка" contentType="html" />
                            </v-col>
                        </v-row>
                    </v-container>

                </v-card-text>
                <v-card-text v-if="!editMode">
                    <div class="text-h6 mb-3 mt-1">
                        Тыдзень {{ current.week }} - [{{ current.title }}]
                    </div>
                    <v-card class="mt-3" >
                    <v-card-text>
                        <p v-html="current.comment"></p>
                    </v-card-text>
                    </v-card>
                    <v-card class="mt-3" title="Заданні">
                        <v-card-text>
                            <div class="pa-3" v-html="current.tasks"></div>
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
                                <v-text-field v-model="addItem.value.week" hint="Нумар тфдня" label="Нумар"></v-text-field>
                            </v-col>
                            <v-col cols="6" sm="3">
                                <v-text-field v-model="addItem.value.title" hint="Назва дня" label="Назва"></v-text-field>
                            </v-col>
                            <v-col cols="12" sm="12">
                                <quill-editor theme="snow" toolbar="minimal" v-model:content="addItem.value.comment"
                                    placeholder="Каментарый" contentType="html" />
                            </v-col>
                            <v-col cols="12" sm="12" class="mt-10">
                                <quill-editor theme="snow" toolbar="minimal" v-model:content="addItem.value.tasks"
                                    placeholder="Заданні" contentType="html" />
                            </v-col>
                            <v-col cols="12" sm="12" class="mt-10">
                                <quill-editor theme="snow" toolbar="minimal" v-model:content="addItem.value.shotcomment"
                                    placeholder="Каментарый кароткі" contentType="html" />
                            </v-col>
                            <v-col cols="12" sm="12" class="mt-10 mb-10">
                                <quill-editor theme="snow" toolbar="minimal" v-model:content="addItem.value.shottasks"
                                    placeholder="Заданні коратка" contentType="html" />
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
const notes = useCollection(query(collection(db, 'weeks'), orderBy('week')))

const dialogAdd = ref(false)
const addItem = ref({
        comment: "",
        tasks: "",
        shotcomment: "",
        shottasks: "",
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
    item.week = +tmp.value.week
    item.title = tmp.value.title
    item.comment = tmp.value.comment
    item.tasks = tmp.value.tasks
    item.shotcomment = tmp.value.shotcomment
    item.shottasks = tmp.value.shottasks
    
    const weekRef = doc(db, "weeks", item.id);

    await updateDoc(weekRef, {
        week: +item.week,
        title: item.title,
        comment: item.comment,
        tasks: item.tasks,
        shotcomment: item.shotcomment,
        shottasks: item.shottasks,
    });

}


function showAdd(){
    addItem.value = ref({
        comment: "",
        tasks: "",
        shotcomment: "",
        shottasks: "",
    })
    dialogAdd.value = true
  }

  async function add(item){
    
    dialogAdd.value = false
    await setDoc(doc(db, "weeks", item.value.week), {
        week: +item.value.week,
        title: item.value.title,
        comment: item.value.comment,
        tasks: item.value.tasks,
        shotcomment: item.value.shotcomment,
        shottasks: item.value.shottasks,
    });
  
    addItem.value = ref({
        comment:"",
        tasks:"",
        shotcomment:"",
        shottasks:""
    })
  }

</script>
  
  
<style>
.dialog-bottom-transition-enter-active,
.dialog-bottom-transition-leave-active {
    transition: transform .2s ease-in-out;
}
</style>