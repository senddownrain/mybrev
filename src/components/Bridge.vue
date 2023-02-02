<template>
    <v-container fluid>
        <v-row dense>
            <v-col cols="12" sm="6">
                <v-select
          v-model="selectedDay"
          :hint="`${selectedDay}`"
          :items="bridgeDaysModel"
          label="Days"
          persistent-hint
          return-object
          single-line
        ></v-select>
            </v-col>
            <v-col cols="12" sm="6" class="mt-2">
                    <v-text-field v-model="loadingDay" hint="дзень" label="дата"></v-text-field>
                <v-btn @click="loadDay()">load</v-btn>
                </v-col>
                
        </v-row>
      <v-row dense>
        <v-col cols="12" sm="12" v-if="devMode">
          <v-card flat>
            <v-card-actions >
              <v-spacer></v-spacer>
              <v-btn @click="showAdd()">Add</v-btn>
            </v-card-actions>
          </v-card>
        </v-col>
  
  
        <v-col v-for="n in Object.getOwnPropertyNames(findItem(selectedDay))" :key="n" cols="12">
                <v-card :title="`${n} - ${selectedItem[n]}`"  >
                    <v-card-text>
                        <p v-html="JSON.stringify(getProp(n, selectedItem[n]))"></p>
                    </v-card-text>
                    
                </v-card>
            </v-col>
      </v-row>
  
      <v-dialog v-model="dialog" ref="my" fullscreen :scrim="false" transition="dialog-bottom-transition">
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
          <v-card-text>
            <quill-editor v-if="editMode" theme="snow" toolbar="minimal" v-model:content="tmp.text" contentType="html" />
  
            <p v-if="!editMode" v-html="current.text">
  
            </p>
  
          </v-card-text>
  
        </v-card>
      </v-dialog>
  
  
      <v-dialog v-model="dialogAdd" fullscreen :scrim="false" transition="dialog-bottom-transition">
        <v-card>
          <v-toolbar dark color="primary">
            <v-btn icon dark @click="dialogAdd = false">
              <v-icon>mdi-close</v-icon>
            </v-btn>
            <v-toolbar-title> Add Note</v-toolbar-title>
            <v-spacer></v-spacer>
            <v-toolbar-items>
  
              <v-btn variant="text" @click="add(addItem)">
                Сохранить
              </v-btn>
              <v-btn  variant="text" @click="dialogAdd = false">
                Отменить
              </v-btn>
            </v-toolbar-items>
          </v-toolbar>
          <v-card-text>
            <v-row>
                <v-col cols="12" sm="6" class="mb-2">
                    <v-text-field v-model="addItem.title" hint="Назва уводзін" label="Назва"></v-text-field>
                </v-col>
                <v-col cols="12" sm="12" class="mb-5">
                  <quill-editor theme="snow" toolbar="minimal" v-model:content="addItem.text" contentType="html" />
                </v-col>
            </v-row>
  
  
          </v-card-text>
  
        </v-card>
      </v-dialog>
  
  
    </v-container>
  </template>
  
  
  <script setup>
  import tables from '@/json'

  import { ref } from 'vue'
  
  import { useCollection, useFirestore } from 'vuefire'
  import { collection, orderBy, query, doc, updateDoc, setDoc, addDoc } from 'firebase/firestore'

  
console.log(tables.Bridge_table.map(a => a.Bridge_DayId));

const bridgeDaysModel = ref(tables.Bridge_table.map(a => a.Bridge_DayId));
const bridgeItemsModel = ref(tables.Bridge_table.map(a => a.Bridge_DayId));
const selectedDay = ref(bridgeDaysModel.value[0]);
const selectedItem = ref({});

const loadingDay = ref("");
function loadDay(){
    selectedItem.value = tables.Bridge_table.find(x => x.Bridge_DayId == loadingDay.value);
}

function findItem(id){
    let item = tables.Bridge_table.find(x => x.Bridge_DayId == id);
    selectedItem.value = item;

    return item;
}

function getProp(name, val){
    let tbl = tables[name+"_table"] 
    if(tbl){
        console.log(name+"_table");
        let itemID = name + "_ID"
        console.log(itemID);
        if(tbl[0][itemID]){
            
            let item = tables[name+"_table"].find(x => x[itemID] == val);
        return JSON.stringify(item);
        }
        else
        {
            return "no id"
        }
        
    }
    else{
        return 'not a table'
    }
}

function getIdProp(obj){
    var props = Object.getOwnPropertyNames(obj);
    var id = props.find(x => x.indexOf("ID") != -1);

    return id; 
}

  const devMode = false
  
  const db = useFirestore()
  const notes = useCollection(query(collection(db, 'notes'), orderBy('title')))
  
  const dialog = ref(false)
  
  const dialogAdd = ref(false)
  const addItem = ref({
    text:""
  })
  
  const current = ref({})
  const tmp = ref({})
  const editMode = ref(false)
  
  
  function strippedHtml(value) {
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
  
    item.text = tmp.value.text
    const noteRef = doc(db, "notes", item.id);
  
    await updateDoc(noteRef, {
      text: tmp.value.text
    });
  }
  
  function showAdd(){
      addItem.value = {
    text:""
  }
      dialogAdd.value = true
    }
  
    async function add(item){
      
      dialogAdd.value = false
      await addDoc(collection(db, "notes"), item)
    
      addItem.value = ref({
    text:""
  })
    }
  
  </script>
  
  
  <style>
  .dialog-bottom-transition-enter-active,
  .dialog-bottom-transition-leave-active {
    transition: transform .2s ease-in-out;
  }
  </style>