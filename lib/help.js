import { Help } from 'commander';

export default function (style = 'cli') {
  if (style === 'md') {
    Help.prototype.optionDescription = (option) => {
      if (option.negate) {
        return option.description;
      }
      const extraInfo = [];
      if (option.mandatory) {
        option.description = `*Required.* ${option.description}`
      }
      if (option.argChoices) {
        option.description += ` One of:\n${option.argChoices.map((choice) => '- ' + JSON.stringify(choice)).join('\n')}\n`;
      }
      if (option.defaultValue !== undefined) {
        // watcher: changed 'default' to 'currently'
        option.description += `\nDefault: ${option.defaultValueDescription || JSON.stringify(option.defaultValue)}`;
      }
      if (extraInfo.length > 0) {
        return `${option.description} (${extraInfo.join(', ')})`;
      }
      return option.description;
    }
    Help.prototype.formatHelp = (cmd, helper) => {
      const termWidth = helper.padWidth(cmd, helper);
      const helpWidth = helper.helpWidth || 80;
      const itemIndentWidth = 2;
      const itemSeparatorWidth = 2; // between term and description
      function formatItem(term, description) {
        if (description) {
          // const fullText = `${term.padEnd(termWidth + itemSeparatorWidth)}${description}`;
          // return helper.wrap(fullText, helpWidth - itemIndentWidth, termWidth + itemSeparatorWidth);
          term = term.replace('<','*')
          term = term.replace('>','*')
          return `**${term}**\n\n${description}`
        }
        return term;
      };
      function formatList(textArray) {
        // watcher: doube-space
        return textArray.join('\n\n---\n').replace(/^/gm, ' '.repeat(itemIndentWidth));
      }
    
      // Usage
      let output = [`Usage: ${helper.commandUsage(cmd)}`, ''];
    
      // Description
      const commandDescription = helper.commandDescription(cmd);
      if (commandDescription.length > 0) {
        output = output.concat([commandDescription, '']);
      }
    
      // Arguments
      const argumentList = helper.visibleArguments(cmd).map((argument) => {
        return formatItem(argument.term, argument.description);
      });
      if (argumentList.length > 0) {
        output = output.concat(['Arguments:', formatList(argumentList), '']);
      }
    
      // Options
      const optionList = helper.visibleOptions(cmd).map((option) => {
        return formatItem(helper.optionTerm(option), helper.optionDescription(option));
      });
      if (optionList.length > 0) {
        output = output.concat(['Options:', formatList(optionList), '']);
      }
    
      // Commands
      const commandList = helper.visibleCommands(cmd).map((cmd) => {
        return formatItem(helper.subcommandTerm(cmd), helper.subcommandDescription(cmd));
      });
      if (commandList.length > 0) {
        output = output.concat(['Commands:', formatList(commandList), '']);
      }
    
      return output.join('\n');
    }    
  }
  else if (style === 'cli') {
    Help.prototype.optionDescription = (option) => {
      option.description = option.description.replace(/`/g,'')
      if (option.negate) {
        return option.description;
      }
      const extraInfo = [];
      if (option.mandatory) {
        extraInfo.push(`REQUIRED`)
      }
      if (option.argChoices) {
        extraInfo.push(
          // use stringify to match the display of the default value
          `choices: ${option.argChoices.map((choice) => JSON.stringify(choice)).join(', ')}`);
      }
      if (option.defaultValue !== undefined) {
        // watcher: changed 'default' to 'currently'
        extraInfo.push(`currently: ${option.defaultValueDescription || JSON.stringify(option.defaultValue)}`);
      }
      if (extraInfo.length > 0) {
        return `${option.description} (${extraInfo.join(', ')})`;
      }
      return option.description;
    }
    Help.prototype.formatHelp = (cmd, helper) => {
      const termWidth = helper.padWidth(cmd, helper);
      const helpWidth = helper.helpWidth || 80;
      const itemIndentWidth = 2;
      const itemSeparatorWidth = 2; // between term and description
      function formatItem(term, description) {
        if (description) {
          const fullText = `${term.padEnd(termWidth + itemSeparatorWidth)}${description}`;
          return helper.wrap(fullText, helpWidth - itemIndentWidth, termWidth + itemSeparatorWidth);
        }
        return term;
      };
      function formatList(textArray) {
        // watcher: doube-space
        return textArray.join('\n\n').replace(/^/gm, ' '.repeat(itemIndentWidth));
      }
    
      // Usage
      let output = [`Usage: ${helper.commandUsage(cmd)}`, ''];
    
      // Description
      const commandDescription = helper.commandDescription(cmd);
      if (commandDescription.length > 0) {
        output = output.concat([commandDescription, '']);
      }
    
      // Arguments
      const argumentList = helper.visibleArguments(cmd).map((argument) => {
        return formatItem(argument.term, argument.description);
      });
      if (argumentList.length > 0) {
        output = output.concat(['Arguments:', formatList(argumentList), '']);
      }
    
      // Options
      const optionList = helper.visibleOptions(cmd).map((option) => {
        return formatItem(helper.optionTerm(option), helper.optionDescription(option));
      });
      if (optionList.length > 0) {
        output = output.concat(['Options:', formatList(optionList), '']);
      }
    
      // Commands
      const commandList = helper.visibleCommands(cmd).map((cmd) => {
        return formatItem(helper.subcommandTerm(cmd), helper.subcommandDescription(cmd));
      });
      if (commandList.length > 0) {
        output = output.concat(['Commands:', formatList(commandList), '']);
      }
    
      return output.join('\n');
    }    
  }
}
