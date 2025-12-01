<template>
	<v-col cols="6">
		<v-textarea :label="fieldTitle" auto-grow variant="filled" v-model="dte[fieldName]"></v-textarea>
	</v-col>
	<v-col cols="6">
		<v-card class="ora-edit" flat>
			<v-card-text class="ora-edit-text">
				<div v-html="dte[fieldName]"></div>
			</v-card-text>
		</v-card>
	</v-col>
</template>

<script setup>
const props = defineProps({
	dte: Object,
	fieldName: String,
	fieldTitle: String
})

import { useSettingsStore } from '@/stores/settings'
const settings = useSettingsStore()

</script>


<style>
.ora-edit-text p {
	margin-top: 10px;
	margin-bottom: 10px;
}

.v-card .ora-edit-text {
	padding-left: 0;
	font-size: calc(0.975rem * v-bind('settings.fontSizeMultiplier'));
	line-height: 1.25;
	font-family: v-bind('settings.fontFamily');
}

</style>