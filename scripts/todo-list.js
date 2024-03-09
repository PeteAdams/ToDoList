/**
 * The data layer for our todo-list module
 */
class ToDoListData {
  /**
   * Gets all of a given user's ToDos
   * 
   * @param {string} userId - id of the user whose ToDos to return
   * @returns {Record<string, ToDo> | undefined}
   */
  static getToDosForUser(userId) {
    return game.users.get(userId)?.getFlag(ToDoList.ID, ToDoList.FLAGS.TODOS);
  }

  /**
   * 
   * @param {string} userId - id of the user to add this ToDo to
   * @param {Partial<ToDo>} toDoData - the ToDo data to use
   */
  static createToDo(userId, toDoData) {
    //generate a random ID for this new ToDO and populate the UserID
    const newToDo = {
      isDone: false,
      ...toDoData,
      id: foundry.utils.randomID(16),
      userId,
    }
    //construct the update to insert the new ToDo
    const newToDos = {
      [newToDo.id]: newToDo
    }
    //update the database with the new ToDos
    return game.users.get(userId)?.setFlag(ToDoList.ID, ToDoList.FLAGS.TODOS, newToDos);
  }

  /**
   * get all toDos for all users indexed by the todo's id
   */
  static get allToDos() {
    const allToDos = game.users.reduce((accumulator, user) => {
      const userTodos = this.getToDosForUser(user.id);
      return {...accumulator, ...userTodos}
    }, {});
      return allToDos;
  }

  /**
   * Updates a given ToDo with the provided data.
   * 
   * @param {string} toDoId - id of the ToDo to update
   * @param {Partial<ToDo>} updateData - changes to be persisted
   */
  static updateToDo(toDoId, updateData) {
    const relevantToDo = this.allToDos[toDoId];
    //construct the update to send
    const update = {[toDoId]: updateData}
    //update the database with the updated ToDo list
    return game.users.get(relevantToDo.userId)?.setFlag(ToDoList.ID, ToDoList.FLAGS.TODOS, update);
  }

  /**
   * Deletes a given ToDo
   * 
   * @param {string} toDoId - id of the ToDo to delete
   */
  static deleteToDo(toDoId) {
    const relevantToDo = this.allToDos[toDoId];
    //foundry specific syntax require to delete a key from a persisted object in the database
    const keyDeletion = {
      [`-=${toDoId}`]: null
    }
    //update the databse with the updated ToDo list
    return game.users.get(relevantToDo.userId)?.setFlag(ToDoList.ID, ToDoList.FLAGS.TODOS, keyDeletion);
  }

  /**
   * Updates the given user's ToDos with the provided updateData. This is
   * useful for updating a single user's ToDos in bulk.
   * 
   * @param {string} userId - user whose todos we are updating
   * @param {object} updateData - data passed to setFlag
   * @returns 
   */
  static updateUserToDos(userId, updateData) {
    return game.users.get(userId)?.setFlag(ToDoList.ID, ToDoList.FLAGS.TODOS, updateData);
  }
}

Hooks.on('renderPlayerList', (playerList, html) => {
  if (!game.settings.get(ToDoList.ID, ToDoList.SETTINGS.INJECT_BUTTON)) {
    return;
  }


  // find the element which has our logged in user's id
  const loggedInUserListItem = html.find(`[data-user-id="${game.userId}"]`)
  
  //create localized tooltip
  const tooltip = game.i18n.localize('TODO-LIST.button-title');

  //insert a button at the end of this element
  loggedInUserListItem.append(
    `<button type='button' class='todo-list-icon-button flex0' title='${tooltip}'>
    <i class='fas fa-tasks'></i>
    </button>`
  );

  //register an eventlistener for this button
  html.on('click', '.todo-list-icon-button', (event) => {
    const userId = $(event.currentTarget).parents('[data-user-id]')?.data()?.userId;
    ToDoList.ToDoListConfig.render(true, {userId});
  });
});

class ToDoListConfig extends FormApplication {
  static get defaultOptions() {
    const defaults = super.defaultOptions;

    const overrides = {
      closeOnSubmit: false,
      height: 'auto',
      id: 'todo-list',
      submitOnChange: true,
      template: ToDoList.TEMPLATES.TODOLIST,
      title: 'To Do List',
      userId: game.userId,
    };

    const mergedOptions = foundry.utils.mergeObject(defaults, overrides);

    return mergedOptions;
  }

  async _handleButtonClick(event) {
    const clickedElement = $(event.currentTarget);
    const action = clickedElement.data().action;
    const toDoId = clickedElement.parents('[data-todo-id]')?.data()?.todoId;

    switch (action) {
      case 'create': {
        await ToDoListData.createToDo(this.options.userId);
        this.render();
        break;
      }

      case 'delete': {
        const confirmed = await Dialog.confirm({
          title: game.i18n.localize("TODO-LIST.confirms.deleteConfirm.Title"),
          content: game.i18n.localize("TODO-LIST.confirms.deleteConfirm.Content")
        });

        if (confirmed) {
          await ToDoListData.deleteToDo(toDoId);
          this.render();
        }

        break;
      }

      default:
        ToDoList.log(false, 'Invalid action detected', action);
    }
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.on('click', "[data-action]", this._handleButtonClick.bind(this));
  }

  getData(options) {
    return {
      todos: ToDoListData.getToDosForUser(options.userId)
    }
  }

  async _updateObject(event, formData) {
    const expandedData = foundry.utils.expandObject(formData);

    await ToDoListData.updateUserToDos(this.options.userId, expandedData);
  }
}

/**
 * A single ToDo in our list of Todos.
 * @typedef {Object} ToDo
 * @property {string} id - A unique ID to identify this todo.
 * @property {string} label - The text of the todo.
 * @property {boolean} isDone - Marks whether the todo is done.
 * @property {string} userId - The user who owns this todo.
 */

/**
 * A class which holds some constants for todo-list
 */
class ToDoList {
    static ID = 'todo-list';

    static FLAGS = {
        TODOS: 'todos'
    }

    static TEMPLATES = {
        TODOLIST: `modules/${this.ID}/templates/todo-list.hbs`
    }

    static initialize(){
      this.ToDoListConfig = new ToDoListConfig();

      game.settings.register(this.ID, this.SETTINGS.INJECT_BUTTON, {
        name: `TODO-LIST.settings.${this.SETTINGS.INJECT_BUTTON}.Name`,
        default: true,
        type: Boolean,
        scope: 'client',
        config: true,
        hint: `TODO-LIST.settings.${this.SETTINGS.INJECT_BUTTON}.Hint`,
        onChange: () => ui.players.render()
      });
    }

    static SETTINGS = {
      INJECT_BUTTON: 'inject-button'
    }

  /**
   * A small helper function which leverages developer mode flags to gate debug logs.
   * 
   * @param {boolean} force - forces the log even if the debug flag is not on
   * @param  {...any} args - what to log
   */
  static log(force, ...args) {  
    const shouldLog = force || game.modules.get('_dev-mode')?.api?.getPackageDebugValue(this.ID);

    if (shouldLog) {
      console.log(this.ID, '|', ...args);
    }
  }
}

Hooks.once('init', () => {
  ToDoList.initialize();
});

/**
 * Register our module's debug flag with developer mode's custom hook
 */
Hooks.once('devModeReady', ({ registerPackageDebugFlag }) => {
  registerPackageDebugFlag(ToDoList.ID);
});